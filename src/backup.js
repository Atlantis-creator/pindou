(function () {
  function ensureZip() {
    if (!window.JSZip) throw new Error("ZIP 功能需要联网加载 JSZip");
  }

  function ensureXlsx() {
    if (!window.XLSX) throw new Error("Excel 功能需要联网加载 SheetJS");
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.append(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function todayISO() {
    const now = new Date();
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
  }

  function paymentText(value) {
    return {
      unpaid: "未付",
      deposit: "已付定金",
      full: "已付全款",
    }[value] || "未付";
  }

  async function buildExcelBlob(orders) {
    ensureXlsx();
    const customerRows = orders.map((order) => ({
      内部ID: order.id,
      顾客微信名: order.customerName,
      收货人姓名: order.recipient,
      地址备注: order.addressNote,
      下单日期: order.orderDate,
      最晚发货日期: order.deadlineDate,
      定金: order.deposit,
      尾款: order.finalPayment,
      运费: order.shippingFee,
      付款状态: paymentText(order.paymentStatus),
      发货状态: order.shippingStatus === "shipped" ? "已发" : "未发",
      备注: order.note,
      更新时间: order.updatedAt,
    }));
    const itemRows = orders.flatMap((order) => order.items.map((item) => ({
      顾客单ID: order.id,
      订单项ID: item.id,
      顾客微信名: order.customerName,
      内容描述: item.description,
      数量: item.qty,
      图片备注: item.imageNote,
      图片数量: item.images.length,
      图片文件: item.images.map((image) => image.fileName).join("；"),
      制作状态: item.made ? "已做" : "待做",
    })));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(customerRows), "顾客单");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(itemRows), "订单项");
    const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
    return new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
  }

  async function exportExcel(orders) {
    const blob = await buildExcelBlob(orders);
    downloadBlob(blob, `拼豆订单查看表_${todayISO()}.xlsx`);
  }

  async function exportZip(orders, images) {
    ensureZip();
    const zip = new JSZip();
    zip.file("orders.json", JSON.stringify({
      version: 2,
      exportedAt: new Date().toISOString(),
      orders,
    }, null, 2));
    const imageFolder = zip.folder("images");
    images.forEach((image) => {
      imageFolder.file(image.fileName, image.blob);
    });
    try {
      const excel = await buildExcelBlob(orders);
      zip.file("orders.xlsx", excel);
    } catch (error) {
      zip.file("orders-xlsx-skipped.txt", String(error.message || error));
    }
    const blob = await zip.generateAsync({ type: "blob" });
    downloadBlob(blob, `拼豆完整备份_${todayISO()}.zip`);
    localStorage.setItem("pindou-last-backup", new Date().toISOString());
  }

  async function importZip(file) {
    ensureZip();
    const zip = await JSZip.loadAsync(file);
    const ordersFile = zip.file("orders.json");
    if (!ordersFile) throw new Error("ZIP 里没有 orders.json");
    const payload = JSON.parse(await ordersFile.async("string"));
    if (!payload || !Array.isArray(payload.orders)) throw new Error("orders.json 格式不正确");
    const images = [];
    const imageFiles = Object.values(zip.files).filter((entry) => !entry.dir && entry.name.startsWith("images/"));
    for (const entry of imageFiles) {
      const blob = await entry.async("blob");
      const fileName = entry.name.replace(/^images\//, "");
      const imageId = fileName.replace(/\.[^.]+$/, "");
      images.push({
        id: imageId,
        fileName,
        blob,
        type: blob.type || "image/jpeg",
        size: blob.size,
        importedAt: new Date().toISOString(),
      });
    }
    return { orders: payload.orders, images };
  }

  function lastBackupText() {
    const raw = localStorage.getItem("pindou-last-backup");
    if (!raw) return "还没有导出过完整 ZIP 备份。";
    const date = new Date(raw);
    return `上次完整备份：${date.toLocaleString("zh-CN")}`;
  }

  window.PindouBackup = {
    exportZip,
    importZip,
    exportExcel,
    lastBackupText,
  };
})();
