(function () {
  const state = {
    orders: [],
    filter: "unshipped",
    query: "",
    expanded: new Set(),
    imageUrls: new Map(),
  };

  const els = {
    todayText: document.getElementById("todayText"),
    statUnshipped: document.getElementById("statUnshipped"),
    statTodoItems: document.getElementById("statTodoItems"),
    statFinalDue: document.getElementById("statFinalDue"),
    searchInput: document.getElementById("searchInput"),
    orderList: document.getElementById("orderList"),
    emptyState: document.getElementById("emptyState"),
    addOrderBtn: document.getElementById("addOrderBtn"),
    backupBtn: document.getElementById("backupBtn"),
    toolsBtn: document.getElementById("toolsBtn"),
    orderDialog: document.getElementById("orderDialog"),
    dialogTitle: document.getElementById("dialogTitle"),
    closeDialog: document.getElementById("closeDialog"),
    orderForm: document.getElementById("orderForm"),
    editingId: document.getElementById("editingId"),
    customerName: document.getElementById("customerName"),
    recipient: document.getElementById("recipient"),
    addressNote: document.getElementById("addressNote"),
    orderDate: document.getElementById("orderDate"),
    deadlineDate: document.getElementById("deadlineDate"),
    deposit: document.getElementById("deposit"),
    finalPayment: document.getElementById("finalPayment"),
    shippingFee: document.getElementById("shippingFee"),
    paymentStatus: document.getElementById("paymentStatus"),
    shippingStatus: document.getElementById("shippingStatus"),
    orderNote: document.getElementById("orderNote"),
    addItemBtn: document.getElementById("addItemBtn"),
    itemsEditor: document.getElementById("itemsEditor"),
    cancelForm: document.getElementById("cancelForm"),
    toolsDialog: document.getElementById("toolsDialog"),
    closeTools: document.getElementById("closeTools"),
    exportZipBtn: document.getElementById("exportZipBtn"),
    exportExcelBtn: document.getElementById("exportExcelBtn"),
    zipInput: document.getElementById("zipInput"),
    backupNote: document.getElementById("backupNote"),
    imageDialog: document.getElementById("imageDialog"),
    largeImage: document.getElementById("largeImage"),
    closeImage: document.getElementById("closeImage"),
    toast: document.getElementById("toast"),
  };

  function id() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return `id_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }

  function todayISO() {
    const now = new Date();
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
  }

  function dateOnly(dateString) {
    return new Date(`${dateString}T00:00:00`);
  }

  function formatDate(dateString) {
    if (!dateString) return "未填日期";
    const d = dateOnly(dateString);
    return `${d.getMonth() + 1}月${d.getDate()}日`;
  }

  function daysUntil(dateString) {
    if (!dateString) return 9999;
    const today = dateOnly(todayISO());
    const target = dateOnly(dateString);
    return Math.round((target - today) / 86400000);
  }

  function money(value) {
    const number = Number(value || 0);
    return `¥${number.toLocaleString("zh-CN", { maximumFractionDigits: 2 })}`;
  }

  function numberValue(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    }[char]));
  }

  function escapeAttribute(value) {
    return escapeHtml(value);
  }

  function paymentText(value) {
    return {
      unpaid: "未付",
      deposit: "已付定金",
      full: "已付全款",
    }[value] || "未付";
  }

  function normalizeOrder(order) {
    return {
      id: order.id || id(),
      customerName: String(order.customerName || "").trim(),
      recipient: String(order.recipient || "").trim(),
      addressNote: String(order.addressNote || "").trim(),
      orderDate: order.orderDate || todayISO(),
      deadlineDate: order.deadlineDate || todayISO(),
      deposit: numberValue(order.deposit),
      finalPayment: numberValue(order.finalPayment),
      shippingFee: numberValue(order.shippingFee),
      paymentStatus: order.paymentStatus || "unpaid",
      shippingStatus: order.shippingStatus || "unshipped",
      note: String(order.note || "").trim(),
      items: Array.isArray(order.items) && order.items.length ? order.items.map(normalizeItem) : [normalizeItem({})],
      updatedAt: order.updatedAt || new Date().toISOString(),
    };
  }

  function normalizeItem(item) {
    return {
      id: item.id || id(),
      description: String(item.description || "").trim(),
      qty: Math.max(1, Number.parseInt(item.qty || 1, 10)),
      imageNote: String(item.imageNote || item.imageMark || "").trim(),
      made: Boolean(item.made),
      images: Array.isArray(item.images) ? item.images.slice(0, 2).map((image) => ({
        id: image.id,
        fileName: image.fileName || `${image.id}.jpg`,
        width: image.width || 0,
        height: image.height || 0,
        size: image.size || 0,
        type: image.type || "image/jpeg",
        originalName: image.originalName || "",
        createdAt: image.createdAt || new Date().toISOString(),
      })).filter((image) => image.id) : [],
    };
  }

  function riskClass(order) {
    if (order.shippingStatus === "shipped") return "shipped";
    const days = daysUntil(order.deadlineDate);
    if (days < 0) return "overdue";
    if (days <= 2) return "soon";
    return "";
  }

  function makeProgress(order) {
    const total = order.items.length || 0;
    const done = order.items.filter((item) => item.made).length;
    if (!total) return "待做 · 0/0";
    return done === total ? `已做 · ${done}/${total}` : `待做 · ${done}/${total}`;
  }

  function toast(message) {
    els.toast.textContent = message;
    els.toast.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => els.toast.classList.remove("show"), 2300);
  }

  async function refresh() {
    state.orders = (await PindouDB.getOrders()).map(normalizeOrder);
    render();
  }

  async function pruneUnreferencedImages() {
    const orders = (await PindouDB.getOrders()).map(normalizeOrder);
    const used = new Set(orders.flatMap((order) => order.items.flatMap((item) => item.images.map((image) => image.id))));
    const images = await PindouDB.getImages();
    await Promise.all(images.filter((image) => !used.has(image.id)).map((image) => PindouDB.deleteImage(image.id)));
  }

  function render() {
    els.todayText.textContent = `今天 ${formatDate(todayISO())}`;
    els.backupNote.textContent = PindouBackup.lastBackupText();
    renderStats();
    renderList();
  }

  function renderStats() {
    const unshipped = state.orders.filter((order) => order.shippingStatus !== "shipped");
    const todoItems = unshipped.reduce((sum, order) => sum + order.items.filter((item) => !item.made).length, 0);
    const finalDue = unshipped.reduce((sum, order) => (
      order.paymentStatus === "full" ? sum : sum + numberValue(order.finalPayment)
    ), 0);
    els.statUnshipped.textContent = unshipped.length;
    els.statTodoItems.textContent = todoItems;
    els.statFinalDue.textContent = money(finalDue);
  }

  function matchesQuery(order) {
    if (!state.query) return true;
    const haystack = [
      order.customerName,
      order.recipient,
      order.addressNote,
      order.note,
      ...order.items.flatMap((item) => [item.description, item.imageNote]),
    ].join(" ").toLowerCase();
    return haystack.includes(state.query.toLowerCase());
  }

  function visibleOrders() {
    return state.orders
      .filter((order) => {
        if (state.filter === "unshipped" && order.shippingStatus === "shipped") return false;
        if (state.filter === "shipped" && order.shippingStatus !== "shipped") return false;
        return matchesQuery(order);
      })
      .sort((a, b) => {
        if (a.shippingStatus !== b.shippingStatus) return a.shippingStatus === "unshipped" ? -1 : 1;
        return dateOnly(a.deadlineDate) - dateOnly(b.deadlineDate);
      });
  }

  function renderList() {
    const orders = visibleOrders();
    els.orderList.innerHTML = "";
    els.emptyState.hidden = orders.length > 0;
    orders.forEach((order) => els.orderList.append(renderOrder(order)));
    hydrateListImages();
  }

  function renderOrder(order) {
    const orderEl = document.createElement("article");
    orderEl.className = ["order", riskClass(order)].filter(Boolean).join(" ");
    const isOpen = state.expanded.has(order.id) || order.items.length === 1;
    orderEl.innerHTML = `
      <div class="order-main" role="button" tabindex="0" data-action="toggle-order" data-id="${order.id}">
        <div class="row">
          <div class="customer">
            <strong>${escapeHtml(order.customerName || "未命名顾客")}</strong>
            <div class="meta">
              <span>${formatDate(order.deadlineDate)}前发</span>
              <span>${order.items.length} 个订单项</span>
              <span>${paymentText(order.paymentStatus)}</span>
            </div>
          </div>
          <button class="toggle ${order.shippingStatus === "shipped" ? "" : "unshipped"}" type="button" data-action="toggle-ship" data-id="${order.id}">
            ${order.shippingStatus === "shipped" ? "已发" : "未发"}
          </button>
        </div>
        <div class="chips">
          <span class="chip">${makeProgress(order)}</span>
          <span class="chip ${order.shippingStatus === "shipped" ? "ship" : ""}">${order.shippingStatus === "shipped" ? "已发" : "未发"}</span>
          <span class="chip">${money(order.deposit + order.finalPayment + order.shippingFee)}</span>
        </div>
      </div>
      <div class="details ${isOpen ? "open" : ""}">
        <div class="details-inner">
          <div class="items">
            ${order.items.map((item) => itemHtml(order.id, item)).join("")}
            <div class="more">
              <button class="action" type="button" data-action="edit" data-id="${order.id}">编辑</button>
              <button class="action" type="button" data-action="duplicate" data-id="${order.id}">复制</button>
              <button class="action danger" type="button" data-action="delete" data-id="${order.id}">删除</button>
            </div>
          </div>
        </div>
      </div>
    `;
    return orderEl;
  }

  function itemHtml(orderId, item) {
    const firstImage = item.images[0];
    return `
      <div class="order-item">
        ${firstImage ? `<img class="thumb" data-image-id="${firstImage.id}" data-action="preview-image" alt="订单图片" />` : `<div class="thumb placeholder">无图</div>`}
        <div class="item-copy">
          <b>${escapeHtml(item.description || "未填写内容")}</b>
          <div class="item-meta">
            <span>${item.qty} 个</span>
            <span>${escapeHtml(item.imageNote || "无图片备注")}</span>
            <span>${item.images.length} 张图</span>
          </div>
        </div>
        <button class="toggle ${item.made ? "" : "todo"}" type="button" data-action="toggle-made" data-order-id="${orderId}" data-item-id="${item.id}">
          ${item.made ? "已做" : "待做"}
        </button>
      </div>
    `;
  }

  async function hydrateListImages() {
    const images = [...document.querySelectorAll("[data-image-id]")];
    for (const img of images) {
      const imageId = img.dataset.imageId;
      const url = await imageUrl(imageId);
      if (url) img.src = url;
    }
  }

  async function imageUrl(imageId) {
    if (state.imageUrls.has(imageId)) return state.imageUrls.get(imageId);
    const record = await PindouDB.getImage(imageId);
    if (!record) return "";
    const url = PindouImage.makeObjectUrl(record);
    state.imageUrls.set(imageId, url);
    return url;
  }

  function openNewOrder() {
    els.dialogTitle.textContent = "新增顾客单";
    fillForm(normalizeOrder({
      orderDate: todayISO(),
      deadlineDate: todayISO(),
      items: [normalizeItem({})],
    }));
    els.editingId.value = "";
    els.orderDialog.showModal();
    setTimeout(() => els.customerName.focus(), 30);
  }

  function openOrder(orderId) {
    const order = state.orders.find((entry) => entry.id === orderId);
    if (!order) return;
    els.dialogTitle.textContent = "编辑顾客单";
    fillForm(order);
    els.orderDialog.showModal();
  }

  function fillForm(order) {
    els.editingId.value = order.id || "";
    els.customerName.value = order.customerName || "";
    els.recipient.value = order.recipient || "";
    els.addressNote.value = order.addressNote || "";
    els.orderDate.value = order.orderDate || todayISO();
    els.deadlineDate.value = order.deadlineDate || todayISO();
    els.deposit.value = order.deposit || 0;
    els.finalPayment.value = order.finalPayment || 0;
    els.shippingFee.value = order.shippingFee || 0;
    els.paymentStatus.value = order.paymentStatus || "unpaid";
    els.shippingStatus.value = order.shippingStatus || "unshipped";
    els.orderNote.value = order.note || "";
    renderItemsEditor(order.items);
  }

  function renderItemsEditor(items) {
    els.itemsEditor.innerHTML = "";
    items.forEach((item) => {
      const node = document.createElement("section");
      node.className = "edit-item";
      node.dataset.itemId = item.id || id();
      node.innerHTML = `
        <div class="item-fields">
          <label class="field">
            <span>内容描述 *</span>
            <input data-field="description" required placeholder="例如：库洛米头像" value="${escapeAttribute(item.description)}" />
          </label>
          <label class="field">
            <span>数量</span>
            <input data-field="qty" type="number" min="1" step="1" inputmode="numeric" value="${item.qty || 1}" />
          </label>
        </div>
        <div class="item-footer">
          <label class="field">
            <span>图片备注</span>
            <input data-field="imageNote" placeholder="例如：第 2 张是修改后版本" value="${escapeAttribute(item.imageNote)}" />
          </label>
          <button class="toggle ${item.made ? "" : "todo"}" type="button" data-edit-toggle data-made="${item.made ? "true" : "false"}">
            ${item.made ? "已做" : "待做"}
          </button>
        </div>
        <div class="image-editor">
          <span class="image-label">图片，最多 2 张，上传后会自动压缩</span>
          <div class="image-slots">
            ${[0, 1].map((slot) => imageSlotHtml(item.images[slot], slot)).join("")}
          </div>
        </div>
        <button class="action danger" type="button" data-remove-item>删除这一项</button>
      `;
      els.itemsEditor.append(node);
      hydrateEditorImages(node);
    });
  }

  function imageSlotHtml(image, slot) {
    return `
      <div class="image-slot" data-slot="${slot}" ${image ? `data-image-json="${escapeAttribute(JSON.stringify(image))}"` : ""}>
        ${imageSlotContent(image, slot)}
      </div>
    `;
  }

  function imageSlotContent(image, slot) {
    return `
      ${image ? `<img data-editor-image-id="${image.id}" alt="订单图片" />` : `
        <div class="empty-image">
          <strong>空位 ${slot + 1}</strong>
          <span>电脑可拖图片到这里</span>
        </div>
      `}
      <div class="image-actions">
        <label class="image-upload">
          ${image ? "替换" : "添加"}
          <input type="file" accept="image/jpeg,image/png,image/webp" data-image-input />
        </label>
        <button type="button" data-remove-image ${image ? "" : "disabled"}>删除</button>
      </div>
    `;
  }

  async function hydrateEditorImages(scope) {
    const imgs = [...scope.querySelectorAll("[data-editor-image-id]")];
    for (const img of imgs) {
      const url = await imageUrl(img.dataset.editorImageId);
      if (url) img.src = url;
    }
  }

  function readItemsEditor() {
    return [...els.itemsEditor.querySelectorAll(".edit-item")].map((node) => ({
      id: node.dataset.itemId || id(),
      description: node.querySelector('[data-field="description"]').value.trim(),
      qty: Math.max(1, Number.parseInt(node.querySelector('[data-field="qty"]').value || "1", 10)),
      imageNote: node.querySelector('[data-field="imageNote"]').value.trim(),
      made: node.querySelector("[data-edit-toggle]").dataset.made === "true",
      images: [...node.querySelectorAll(".image-slot")]
        .map((slot) => slot.dataset.imageJson ? JSON.parse(slot.dataset.imageJson) : null)
        .filter(Boolean),
    })).filter((item) => item.description || item.imageNote || item.images.length);
  }

  function orderFromForm() {
    return normalizeOrder({
      id: els.editingId.value || id(),
      customerName: els.customerName.value,
      recipient: els.recipient.value,
      addressNote: els.addressNote.value,
      orderDate: els.orderDate.value,
      deadlineDate: els.deadlineDate.value,
      deposit: els.deposit.value,
      finalPayment: els.finalPayment.value,
      shippingFee: els.shippingFee.value,
      paymentStatus: els.paymentStatus.value,
      shippingStatus: els.shippingStatus.value,
      note: els.orderNote.value,
      items: readItemsEditor(),
      updatedAt: new Date().toISOString(),
    });
  }

  async function saveForm() {
    const order = orderFromForm();
    if (!order.customerName) {
      toast("顾客微信名必填");
      return;
    }
    if (!order.items.length) {
      toast("至少填写一个订单项");
      return;
    }
    await PindouDB.saveOrder(order);
    await pruneUnreferencedImages();
    await refresh();
    els.orderDialog.close();
    toast("已保存");
  }

  async function saveImageToSlot(file, slot, shouldConfirmReplace = false) {
    if (!file || !slot) return;
    if (shouldConfirmReplace && slot.dataset.imageJson && !confirm("这个位置已有图片，确定替换吗？")) return;
    try {
      toast("正在压缩图片");
      const result = await PindouImage.compress(file);
      const imageId = id();
      const image = {
        id: imageId,
        fileName: `${imageId}.jpg`,
        width: result.width,
        height: result.height,
        size: result.size,
        type: result.type,
        originalName: result.originalName,
        createdAt: new Date().toISOString(),
      };
      await PindouDB.putImage({ ...image, blob: result.blob });
      slot.dataset.imageJson = JSON.stringify(image);
      slot.innerHTML = imageSlotContent(image, Number(slot.dataset.slot));
      await hydrateEditorImages(slot);
      toast("图片已压缩保存");
    } catch (error) {
      toast(error.message || "图片处理失败");
    }
  }

  async function handleImageUpload(input) {
    const file = input.files && input.files[0];
    input.value = "";
    if (!file) return;
    await saveImageToSlot(file, input.closest(".image-slot"));
  }

  function hasDraggedFiles(event) {
    return [...(event.dataTransfer?.types || [])].includes("Files");
  }

  function clearDropTargets() {
    els.itemsEditor.querySelectorAll(".image-slot.drag-over").forEach((slot) => {
      slot.classList.remove("drag-over");
    });
  }

  async function handleImageDrop(event) {
    if (!hasDraggedFiles(event)) return;
    event.preventDefault();
    const slot = event.target.closest(".image-slot");
    clearDropTargets();
    if (!slot) {
      toast("请把图片拖到具体的图片空位");
      return;
    }
    const files = [...(event.dataTransfer?.files || [])];
    if (!files.length) {
      toast("没有读取到图片，请改用“添加”选择图片");
      return;
    }
    if (files.length > 1) toast("每个图片位置一次只接收 1 张");
    await saveImageToSlot(files[0], slot, true);
  }

  async function removeImage(button) {
    const slot = button.closest(".image-slot");
    if (!slot.dataset.imageJson) return;
    slot.removeAttribute("data-image-json");
    slot.innerHTML = imageSlotContent(null, Number(slot.dataset.slot));
    toast("保存订单后生效");
  }

  async function toggleShip(orderId) {
    const order = state.orders.find((entry) => entry.id === orderId);
    if (!order) return;
    const willShip = order.shippingStatus !== "shipped";
    if (willShip) {
      const todoCount = order.items.filter((item) => !item.made).length;
      if (todoCount > 0) {
        const confirmed = confirm(`这单还有 ${todoCount} 个订单项是待做。确认已经发货吗？确认后这些订单项会自动改为已做。`);
        if (!confirmed) return;
        order.items.forEach((item) => {
          item.made = true;
        });
      }
    }
    order.shippingStatus = willShip ? "shipped" : "unshipped";
    order.updatedAt = new Date().toISOString();
    await PindouDB.saveOrder(order);
    await refresh();
  }

  async function toggleMade(orderId, itemId) {
    const order = state.orders.find((entry) => entry.id === orderId);
    if (!order) return;
    const item = order.items.find((entry) => entry.id === itemId);
    if (!item) return;
    item.made = !item.made;
    order.updatedAt = new Date().toISOString();
    await PindouDB.saveOrder(order);
    await refresh();
  }

  async function duplicateOrder(orderId) {
    const order = state.orders.find((entry) => entry.id === orderId);
    if (!order) return;
    const copy = normalizeOrder({
      ...JSON.parse(JSON.stringify(order)),
      id: id(),
      customerName: `${order.customerName} 副本`,
      shippingStatus: "unshipped",
      items: order.items.map((item) => ({
        ...item,
        id: id(),
        made: false,
        images: [],
      })),
      updatedAt: new Date().toISOString(),
    });
    await PindouDB.saveOrder(copy);
    await refresh();
    toast("已复制顾客单，图片未复制");
  }

  async function deleteOrder(orderId) {
    const order = state.orders.find((entry) => entry.id === orderId);
    if (!order) return;
    if (!confirm(`删除 ${order.customerName || "这条顾客单"}？`)) return;
    await PindouDB.deleteOrder(orderId);
    await refresh();
    toast("已删除");
  }

  async function previewImage(imageId) {
    const url = await imageUrl(imageId);
    if (!url) return;
    els.largeImage.src = url;
    els.imageDialog.showModal();
  }

  async function exportZip() {
    try {
      const images = await PindouDB.getImages();
      await PindouBackup.exportZip(state.orders, images);
      els.backupNote.textContent = PindouBackup.lastBackupText();
      toast("已导出完整 ZIP 备份");
    } catch (error) {
      toast(error.message || "导出失败");
    }
  }

  async function exportExcel() {
    try {
      await PindouBackup.exportExcel(state.orders);
      toast("已导出 Excel 查看表");
    } catch (error) {
      toast(error.message || "Excel 导出失败");
    }
  }

  async function importZip(file) {
    if (!file) return;
    try {
      const mode = confirm("点“确定”覆盖当前数据；点“取消”合并到当前数据。") ? "replace" : "merge";
      const payload = await PindouBackup.importZip(file);
      const orders = payload.orders.map(normalizeOrder);
      if (mode === "replace") await PindouDB.replaceAll(orders, payload.images);
      else await PindouDB.mergeAll(orders, payload.images);
      await pruneUnreferencedImages();
      await refresh();
      toast(mode === "replace" ? "已覆盖导入 ZIP" : "已合并导入 ZIP");
    } catch (error) {
      toast(error.message || "ZIP 导入失败");
    } finally {
      els.zipInput.value = "";
    }
  }

  document.addEventListener("click", async (event) => {
    const actionEl = event.target.closest("[data-action]");
    if (!actionEl) return;
    const action = actionEl.dataset.action;
    if (action === "toggle-order") {
      const orderId = actionEl.dataset.id;
      const order = state.orders.find((entry) => entry.id === orderId);
      if (!order) return;
      if (order.items.length === 1) openOrder(orderId);
      else {
        if (state.expanded.has(orderId)) state.expanded.delete(orderId);
        else state.expanded.add(orderId);
        renderList();
      }
    }
    if (action === "toggle-ship") await toggleShip(actionEl.dataset.id);
    if (action === "toggle-made") await toggleMade(actionEl.dataset.orderId, actionEl.dataset.itemId);
    if (action === "edit") openOrder(actionEl.dataset.id);
    if (action === "duplicate") await duplicateOrder(actionEl.dataset.id);
    if (action === "delete") await deleteOrder(actionEl.dataset.id);
    if (action === "preview-image") await previewImage(actionEl.dataset.imageId);
  });

  document.addEventListener("keydown", (event) => {
    const actionEl = event.target.closest('[data-action="toggle-order"]');
    if (!actionEl || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    actionEl.click();
  });

  els.addOrderBtn.addEventListener("click", openNewOrder);
  els.closeDialog.addEventListener("click", () => els.orderDialog.close());
  els.cancelForm.addEventListener("click", () => els.orderDialog.close());
  els.toolsBtn.addEventListener("click", () => els.toolsDialog.showModal());
  els.backupBtn.addEventListener("click", exportZip);
  els.closeTools.addEventListener("click", () => els.toolsDialog.close());
  els.exportZipBtn.addEventListener("click", exportZip);
  els.exportExcelBtn.addEventListener("click", exportExcel);
  els.zipInput.addEventListener("change", (event) => importZip(event.target.files[0]));
  els.closeImage.addEventListener("click", () => els.imageDialog.close());
  els.searchInput.addEventListener("input", (event) => {
    state.query = event.target.value.trim();
    renderList();
  });
  document.querySelectorAll(".filter").forEach((button) => {
    button.addEventListener("click", () => {
      state.filter = button.dataset.filter;
      document.querySelectorAll(".filter").forEach((entry) => entry.classList.toggle("active", entry === button));
      renderList();
    });
  });
  els.addItemBtn.addEventListener("click", () => {
    const items = readItemsEditor();
    items.push(normalizeItem({}));
    renderItemsEditor(items);
    els.itemsEditor.lastElementChild?.querySelector('[data-field="description"]')?.focus();
  });
  els.itemsEditor.addEventListener("click", async (event) => {
    const removeItem = event.target.closest("[data-remove-item]");
    const toggle = event.target.closest("[data-edit-toggle]");
    const removeImg = event.target.closest("[data-remove-image]");
    if (removeItem) {
      if (els.itemsEditor.children.length <= 1) {
        toast("至少保留一个订单项");
        return;
      }
      removeItem.closest(".edit-item").remove();
    }
    if (toggle) {
      const next = toggle.dataset.made !== "true";
      toggle.dataset.made = next ? "true" : "false";
      toggle.textContent = next ? "已做" : "待做";
      toggle.classList.toggle("todo", !next);
    }
    if (removeImg) await removeImage(removeImg);
  });
  els.itemsEditor.addEventListener("change", (event) => {
    const input = event.target.closest("[data-image-input]");
    if (input) handleImageUpload(input);
  });
  els.itemsEditor.addEventListener("dragover", (event) => {
    if (!hasDraggedFiles(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    const slot = event.target.closest(".image-slot");
    clearDropTargets();
    slot?.classList.add("drag-over");
  });
  els.itemsEditor.addEventListener("dragleave", (event) => {
    if (!els.itemsEditor.contains(event.relatedTarget)) clearDropTargets();
  });
  els.itemsEditor.addEventListener("drop", handleImageDrop);
  document.addEventListener("dragover", (event) => {
    if (hasDraggedFiles(event)) event.preventDefault();
  });
  document.addEventListener("drop", (event) => {
    if (!hasDraggedFiles(event) || els.itemsEditor.contains(event.target)) return;
    event.preventDefault();
    clearDropTargets();
    toast("请先打开订单，再把图片拖到图片空位");
  });
  els.orderForm.addEventListener("submit", (event) => {
    event.preventDefault();
    saveForm();
  });

  (async function init() {
    await pruneUnreferencedImages();
    await refresh();
  })().catch((error) => {
    console.error(error);
    toast("数据读取失败，请检查浏览器权限");
  });
})();
