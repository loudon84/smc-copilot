/**
 * CRM-Lite demo page SDK (V6.0 HostBridge + legacy CRM compat).
 */
(function () {
  "use strict";

  if (window.__copilotCrmLiteJssdkLoaded) return;

  var DESKTOP_SOURCE = "copilot-desktop";
  var SDK_SOURCE = "copilot-host-jssdk";
  var LEGACY_SDK_SOURCE = "copilot-crm-jssdk";
  var HOST_COMMAND_CHANNEL = "host.desktop.command";
  var LEGACY_COMMAND_CHANNEL = "crm.desktop.command";
  var COMMAND_RESULT_CHANNEL = "host.desktop.command.result";
  var LEGACY_COMMAND_RESULT_CHANNEL = "crm.desktop.command.result";
  var HOST_SUBMIT_CHANNEL = "host.bridge.submit";
  var HOST_READY_CHANNEL = "host.page.ready";
  var PROTOCOL_VERSION = "6.0";
  var SDK_VERSION = "6.0.0";
  var commandHandlers = [];

  /** Electron preload 注入的 API（须在覆盖全局对象前捕获） */
  var nativeHostBridge = window.CopilotHostBridge;
  var nativeHostBridgeSdk = window.CopilotHostBridgeSDK;

  /** 与 bridge-config.json / bridge-config.template.json 中 allowedSkills 对齐 */
  var PRODUCT_SKILL_BY_ACTION = {
    analytic: "crm-product-analytic",
    view: "crm-product-analytic",
    create: "crm-product-create",
    edit: "crm-product-edit",
  };

  function resolveProductSkillName(action, skillName) {
    if (skillName && typeof skillName === "string") return skillName;
    return PRODUCT_SKILL_BY_ACTION[action] || undefined;
  }

  function isHostBridgeAvailable() {
    if (nativeHostBridge && typeof nativeHostBridge.isAvailable === "function") {
      try {
        if (nativeHostBridge.isAvailable()) return true;
      } catch (_e) {
        /* ignore */
      }
    }
    if (window.CopilotDesktopCRM && typeof window.CopilotDesktopCRM.isAvailable === "function") {
      try {
        return window.CopilotDesktopCRM.isAvailable();
      } catch (_e) {
        /* ignore */
      }
    }
    return false;
  }

  function notifyBridgeStatus() {
    var available = isHostBridgeAvailable();
    window.dispatchEvent(
      new CustomEvent("crm-lite:bridge-status", {
        detail: { available: available, mode: available ? "electron" : "browser" },
      }),
    );
    return available;
  }

  function setReceiverLog(text) {
    var el =
      document.getElementById("bridgeLog") ||
      document.getElementById("electronBridgeLog") ||
      document.querySelector("[data-electron-bridge-log]");
    if (el) el.textContent = text;
  }

  function fillInput(name, value) {
    if (value === undefined || value === null) return;
    var el =
      document.querySelector('[name="' + name + '"]') ||
      document.getElementById(name) ||
      document.querySelector('[data-field="' + name + '"]');
    if (!el) return;
    if ("value" in el) el.value = String(value);
  }

  function fillProductForm(fields) {
    if (!fields || typeof fields !== "object") return;
    var keys = [
      "sku",
      "brand",
      "model",
      "productName",
      "series",
      "os",
      "chipset",
      "screenSize",
      "ram",
      "storage",
      "color",
      "batteryMah",
      "network",
      "retailPrice",
      "status",
      "launchDate",
      "description",
    ];
    for (var i = 0; i < keys.length; i++) {
      fillInput(keys[i], fields[keys[i]]);
    }
    if (typeof window.layui !== "undefined" && window.layui.form) {
      try {
        window.layui.form.render();
      } catch (_e) {
        /* ignore */
      }
    }
    window.dispatchEvent(
      new CustomEvent("crm-lite:product-filled", { detail: { product: fields } }),
    );
  }

  function renderSuppliers(suppliers) {
    var container =
      document.getElementById("supplierRows") ||
      document.getElementById("supplierTableBody") ||
      document.querySelector("[data-supplier-table-body]");
    if (!container || !Array.isArray(suppliers)) return;
    container.innerHTML = suppliers
      .map(function (row) {
        return (
          "<tr><td>" +
          (row.supplierName || row.supplierId || "") +
          "</td><td>" +
          (row.supplyPrice != null ? row.supplyPrice : "") +
          "</td><td>" +
          (row.stockQty != null ? row.stockQty : "") +
          "</td></tr>"
        );
      })
      .join("");
  }

  function fillHostFormPayload(payload) {
    if (!payload || typeof payload !== "object") return;
    if (payload.fields) fillProductForm(payload.fields);
    if (payload.subTables && payload.subTables.suppliers) {
      renderSuppliers(payload.subTables.suppliers);
    }
  }

  function postCommandAck(command, result, ok, errMessage) {
    var now = new Date().toISOString();
    var ackResult = {
      ok: ok,
      type: command.type,
      action: result && result.action,
      message: errMessage || (result && result.message),
      data: result && result.data,
      errorCode: ok ? undefined : "COMMAND_FAILED",
    };
    if (nativeHostBridgeSdk && typeof nativeHostBridgeSdk.ack === "function") {
      nativeHostBridgeSdk.ack(command.commandId, ackResult);
      return;
    }
    var ack = {
      commandId: command.commandId,
      receivedAt: now,
      completedAt: now,
      ok: ackResult.ok,
      type: ackResult.type,
      action: ackResult.action,
      data: ackResult.data,
      message: ackResult.message,
      errorCode: ackResult.errorCode,
    };
    window.postMessage(
      { source: SDK_SOURCE, channel: COMMAND_RESULT_CHANNEL, result: ack },
      window.location.origin,
    );
    window.postMessage(
      { source: LEGACY_SDK_SOURCE, channel: LEGACY_COMMAND_RESULT_CHANNEL, result: ack },
      window.location.origin,
    );
  }

  async function handleDesktopCommand(command) {
    var type = command && command.type;
    setReceiverLog(JSON.stringify(command, null, 2));

    if (
      type === "desktop.host.form.fill" ||
      type === "desktop.host.from.fill" ||
      type === "desktop.crm.form.fill" ||
      type === "desktop.crm.product.fillForm"
    ) {
      var payload = command.payload || {};
      var fields = payload.fields || payload.product || payload;
      fillHostFormPayload({ fields: fields, subTables: payload.subTables });
      return { ok: true, action: "host.form.fill", message: "商品表单已填充" };
    }

    if (type === "desktop.crm.product.create") {
      var product = command.payload && command.payload.product;
      fillProductForm(product);
      return { ok: true, action: "crm.product.create", data: { id: "mock-" + Date.now() } };
    }

    throw new Error("unsupported command: " + type);
  }

  function dispatchCommandToHandlers(command) {
    for (var i = 0; i < commandHandlers.length; i++) {
      void Promise.resolve(commandHandlers[i](command)).catch(function (err) {
        setReceiverLog("onCommand error: " + (err && err.message ? err.message : String(err)));
      });
    }
  }

  function onCommand(handler) {
    if (typeof handler !== "function") return function () {};
    commandHandlers.push(handler);
    return function () {
      commandHandlers = commandHandlers.filter(function (item) {
        return item !== handler;
      });
    };
  }

  function ack(commandId, result) {
    if (nativeHostBridgeSdk && typeof nativeHostBridgeSdk.ack === "function") {
      return nativeHostBridgeSdk.ack(commandId, result);
    }
    var now = new Date().toISOString();
    var ackBody = {
      commandId: commandId,
      ok: result.ok,
      type: result.type,
      action: result.action,
      message: result.message,
      data: result.data,
      errorCode: result.errorCode,
      receivedAt: now,
      completedAt: now,
    };
    window.postMessage(
      { source: SDK_SOURCE, channel: COMMAND_RESULT_CHANNEL, result: ackBody },
      window.location.origin,
    );
  }

  async function submit(input) {
    var payload = Object.assign({}, input, {
      skillName: resolveProductSkillName(input.action, input.skillName),
    });
    if (nativeHostBridge && typeof nativeHostBridge.submit === "function") {
      return nativeHostBridge.submit(payload);
    }

    window.postMessage(
      {
        source: SDK_SOURCE,
        channel: HOST_SUBMIT_CHANNEL,
        event: {
          source: "host-web",
          protocolVersion: PROTOCOL_VERSION,
          sdkVersion: SDK_VERSION,
          requestId: "host_" + Date.now(),
          type: "host.bridge.submit",
          formType: payload.formType,
          action: payload.action,
          callbackUrl: payload.callbackUrl,
          skillName: payload.skillName,
          trigger: {
            type: "user-click",
            elementId: input.trigger && input.trigger.elementId,
            label: input.trigger && input.trigger.label,
            timestamp: new Date().toISOString(),
          },
          pageContext: payload.pageContext,
        },
      },
      window.location.origin,
    );

    return {
      ok: false,
      requestId: "",
      message: "Electron preload bridge not detected; postMessage fallback for local browser.",
    };
  }

  async function ready(input) {
    if (nativeHostBridge && typeof nativeHostBridge.ready === "function") {
      return nativeHostBridge.ready(input);
    }

    window.postMessage(
      {
        source: SDK_SOURCE,
        channel: HOST_READY_CHANNEL,
        event: {
          source: "host-web",
          protocolVersion: PROTOCOL_VERSION,
          sdkVersion: SDK_VERSION,
          requestId: "host_ready_" + Date.now(),
          type: "host.page.ready",
          formType: input && input.formType,
          action: input && input.action,
          pageContext: {
            app: (input && input.pageContext && input.pageContext.app) || "crm-lite",
            url: (input && input.pageContext && input.pageContext.url) || window.location.href,
            title: (input && input.pageContext && input.pageContext.title) || document.title,
            entityType: input && input.pageContext && input.pageContext.entityType,
            entityId: input && input.pageContext && input.pageContext.entityId,
            entityName: input && input.pageContext && input.pageContext.entityName,
          },
        },
      },
      window.location.origin,
    );

    return { ok: true, requestId: "", message: "ready emitted via postMessage fallback" };
  }

  function submitProductContext(product, options) {
    return submit({
      formType: "product",
      action: "view",
      skillName: PRODUCT_SKILL_BY_ACTION.view,
      pageContext: {
        app: "crm-lite",
        url: window.location.href,
        title: document.title,
        entityType: "product",
        entityId: product && product.id,
        entityName: product && product.productName,
        data: { product: product },
      },
      trigger: {
        elementId: options && options.triggerElementId,
        label: options && options.triggerLabel,
      },
    });
  }

  var hostBridgeApi = {
    version: SDK_VERSION,
    protocolVersion: PROTOCOL_VERSION,
    isAvailable: isHostBridgeAvailable,
    isDesktopAvailable: isHostBridgeAvailable,
    submit: submit,
    ready: ready,
    onCommand: onCommand,
    ack: ack,
    submitProductContext: submitProductContext,
    resolveProductSkillName: resolveProductSkillName,
    PRODUCT_SKILL_BY_ACTION: PRODUCT_SKILL_BY_ACTION,
  };

  /** 勿覆盖 Electron preload 已注入的 CopilotHostBridge*，否则 isAvailable/ack 会失效 */
  if (!nativeHostBridge) {
    window.CopilotHostBridge = hostBridgeApi;
    window.CopilotHostBridgeSDK = hostBridgeApi;
  }

  function registerOnCommand(handler) {
    var offSdk = onCommand(handler);
    var offNative =
      nativeHostBridgeSdk && typeof nativeHostBridgeSdk.onCommand === "function"
        ? nativeHostBridgeSdk.onCommand(handler)
        : function () {};
    return function () {
      offSdk();
      offNative();
    };
  }

  function bridgeIsAvailable() {
    return isHostBridgeAvailable();
  }

  var pageSdkApi = {
    version: SDK_VERSION,
    protocolVersion: PROTOCOL_VERSION,
    isAvailable: bridgeIsAvailable,
    isDesktopAvailable: bridgeIsAvailable,
    submitProductContext: submitProductContext,
    submit: submit,
    ready: ready,
    onCommand: registerOnCommand,
    ack: ack,
    resolveProductSkillName: resolveProductSkillName,
    PRODUCT_SKILL_BY_ACTION: PRODUCT_SKILL_BY_ACTION,
    mockElectronCommand: function (command) {
      window.postMessage(
        {
          source: DESKTOP_SOURCE,
          channel: HOST_COMMAND_CHANNEL,
          command: command,
          replyRequired: !!(command && (command.replyRequired || command.expectAck)),
        },
        window.location.origin,
      );
    },
  };

  /**
   * contextBridge 暴露的 CopilotCrmDesktopSDK 在页面侧为只读，直接赋值会抛错并导致 inject 失败。
   * 页面请优先使用 CopilotCrmLiteDemoSDK（或回退到 Preload 全局对象）。
   */
  var existingDesktopSdk = window.CopilotCrmDesktopSDK;
  if (!existingDesktopSdk) {
    window.CopilotCrmDesktopSDK = pageSdkApi;
  } else {
    window.CopilotCrmLiteDemoSDK = pageSdkApi;
  }

  window.__copilotCrmLiteJssdkLoaded = true;

  window.addEventListener("message", function (event) {
    if (event.origin !== window.location.origin) return;
    var msg = event.data;
    if (!msg || msg.source !== DESKTOP_SOURCE) return;
    if (
      msg.channel !== HOST_COMMAND_CHANNEL &&
      msg.channel !== LEGACY_COMMAND_CHANNEL
    ) {
      return;
    }
    if (!msg.command) return;

    dispatchCommandToHandlers(msg.command);

    void handleDesktopCommand(msg.command)
      .then(function (result) {
        setReceiverLog("command ok: " + (msg.command.type || "") + "\n" + JSON.stringify(result, null, 2));
        if (msg.replyRequired) {
          postCommandAck(msg.command, result, true);
        }
      })
      .catch(function (err) {
        var message = err && err.message ? err.message : String(err);
        setReceiverLog("command error: " + message);
        if (msg.replyRequired) {
          postCommandAck(msg.command, null, false, message);
        }
      });
  });

  window.addEventListener("message", function (event) {
    if (event.origin !== window.location.origin) return;
    var msg = event.data;
    if (!msg || msg.source !== DESKTOP_SOURCE) return;
    if (msg.channel === "host.desktop.ready" || msg.channel === "crm.desktop.ready") {
      notifyBridgeStatus();
    }
  });

  notifyBridgeStatus();
  window.addEventListener("focus", notifyBridgeStatus);
  setTimeout(notifyBridgeStatus, 100);
  setTimeout(notifyBridgeStatus, 500);
})();
