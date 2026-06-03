(function () {
  const MAX_EDGE = 1200;
  const QUALITY = 0.75;
  const MAX_SIZE = 500 * 1024;
  const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];

  function assertImage(file) {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      throw new Error("只支持 JPG、PNG、WebP 图片");
    }
  }

  function loadImage(file) {
    if ("createImageBitmap" in window) return createImageBitmap(file);
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("图片读取失败"));
      };
      img.src = url;
    });
  }

  function canvasToBlob(canvas) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("图片压缩失败"));
      }, "image/jpeg", QUALITY);
    });
  }

  async function compress(file) {
    assertImage(file);
    const bitmap = await loadImage(file);
    const sourceWidth = bitmap.width;
    const sourceHeight = bitmap.height;
    const scale = Math.min(1, MAX_EDGE / Math.max(sourceWidth, sourceHeight));
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { alpha: false });
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);
    if (bitmap.close) bitmap.close();

    const blob = await canvasToBlob(canvas);
    if (blob.size > MAX_SIZE) {
      throw new Error("图片太大，请换一张或先截图再上传");
    }

    return {
      blob,
      width,
      height,
      size: blob.size,
      type: "image/jpeg",
      originalName: file.name || "order-image.jpg",
    };
  }

  function makeObjectUrl(record) {
    return URL.createObjectURL(record.blob);
  }

  window.PindouImage = {
    compress,
    makeObjectUrl,
    MAX_EDGE,
    QUALITY,
    MAX_SIZE,
  };
})();
