(function () {
  const DB_NAME = "pindou-board";
  const DB_VERSION = 1;
  const ORDER_STORE = "orders";
  const IMAGE_STORE = "images";
  let dbPromise;

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(ORDER_STORE)) {
          const orders = db.createObjectStore(ORDER_STORE, { keyPath: "id" });
          orders.createIndex("shippingStatus", "shippingStatus", { unique: false });
          orders.createIndex("deadlineDate", "deadlineDate", { unique: false });
        }
        if (!db.objectStoreNames.contains(IMAGE_STORE)) {
          db.createObjectStore(IMAGE_STORE, { keyPath: "id" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return dbPromise;
  }

  async function tx(storeNames, mode, runner) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeNames, mode);
      const stores = Array.isArray(storeNames)
        ? Object.fromEntries(storeNames.map((name) => [name, transaction.objectStore(name)]))
        : transaction.objectStore(storeNames);
      let result;
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
      result = runner(stores);
    });
  }

  function requestToPromise(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  function getAll(store) {
    return requestToPromise(store.getAll());
  }

  async function getOrders() {
    return tx(ORDER_STORE, "readonly", (store) => getAll(store));
  }

  async function saveOrder(order) {
    return tx(ORDER_STORE, "readwrite", (store) => {
      store.put(order);
    });
  }

  async function deleteOrder(orderId) {
    const order = await getOrder(orderId);
    const imageIds = order ? order.items.flatMap((item) => item.images.map((image) => image.id)) : [];
    return tx([ORDER_STORE, IMAGE_STORE], "readwrite", (stores) => {
      stores.orders.delete(orderId);
      imageIds.forEach((imageId) => stores.images.delete(imageId));
    });
  }

  async function getOrder(orderId) {
    return tx(ORDER_STORE, "readonly", (store) => requestToPromise(store.get(orderId)));
  }

  async function putImage(record) {
    return tx(IMAGE_STORE, "readwrite", (store) => {
      store.put(record);
    });
  }

  async function getImage(imageId) {
    return tx(IMAGE_STORE, "readonly", (store) => requestToPromise(store.get(imageId)));
  }

  async function deleteImage(imageId) {
    return tx(IMAGE_STORE, "readwrite", (store) => {
      store.delete(imageId);
    });
  }

  async function getImages() {
    return tx(IMAGE_STORE, "readonly", (store) => getAll(store));
  }

  async function replaceAll(orders, images) {
    return tx([ORDER_STORE, IMAGE_STORE], "readwrite", (stores) => {
      stores.orders.clear();
      stores.images.clear();
      orders.forEach((order) => stores.orders.put(order));
      images.forEach((image) => stores.images.put(image));
    });
  }

  async function mergeAll(orders, images) {
    return tx([ORDER_STORE, IMAGE_STORE], "readwrite", (stores) => {
      orders.forEach((order) => stores.orders.put(order));
      images.forEach((image) => stores.images.put(image));
    });
  }

  window.PindouDB = {
    getOrders,
    saveOrder,
    deleteOrder,
    getOrder,
    putImage,
    getImage,
    deleteImage,
    getImages,
    replaceAll,
    mergeAll,
  };
})();
