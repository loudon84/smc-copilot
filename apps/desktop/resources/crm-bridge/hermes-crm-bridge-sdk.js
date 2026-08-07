(function () {
  "use strict";

  var SDK_SOURCE = "copilot-crm-jssdk";
  var DESKTOP_SOURCE = "copilot-desktop";
  var EVENT_CHANNEL = "crm.desktop.bridge";
  var READY_EVENT_CHANNEL = "crm.desktop.ready";
  var COMMAND_CHANNEL = "crm.desktop.command";
  var COMMAND_RESULT_CHANNEL = "crm.desktop.command.result";

  var handoffStore = new Map();
  var registeredButtons = new Map();
  var registeredActions = new Map();
  var jsonHandlers = [];

  var config = {
    app: "crm",
    sdkVersion: "0.3.0",
    collectContext: function () {
      return {
        app: "crm",
        url: location.href,
        title: document.title,
        fields: {},
        safeText: document.body ? document.body.innerText.slice(0, 3000) : "",
      };
    },
  };

  function randomId(prefix) {
    return prefix + "_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
  }

  function saveHandoffJson(input) {
    handoffStore.set(input.handoffId, input);
    window.dispatchEvent(
      new CustomEvent("copilot-crm-json-ready", {
        detail: input,
      }),
    );
  }

  function getHandoffJson(handoffId) {
    return handoffStore.get(handoffId) || null;
  }

  function postBridgeEvent(event) {
    window.postMessage(
      {
        source: SDK_SOURCE,
        channel: EVENT_CHANNEL,
        event: event,
      },
      window.location.origin,
    );
  }

  function postCommandResult(result) {
    window.postMessage(
      {
        source: SDK_SOURCE,
        channel: COMMAND_RESULT_CHANNEL,
        result: result,
      },
      window.location.origin,
    );
  }

  function collectContext() {
    try {
      return config.collectContext();
    } catch (err) {
      return {
        app: "crm",
        url: location.href,
        title: document.title,
        fields: {},
        safeText: "",
      };
    }
  }

  function findButtonElement(actionKey, selector) {
    if (actionKey && registeredButtons.has(actionKey)) {
      var registeredSelector = registeredButtons.get(actionKey);
      var byRegistered = document.querySelector(registeredSelector);
      if (byRegistered) return byRegistered;
    }

    if (actionKey) {
      var byAction = document.querySelector('[data-ai-action="' + actionKey + '"]');
      if (byAction) return byAction;
    }

    if (selector) {
      return document.querySelector(selector);
    }

    return null;
  }

  async function executeCommand(command) {
    var receivedAt = new Date().toISOString();
    var type = command && command.type;

    try {
      if (type === "desktop.crm.pushJson") {
        var payload = (command && command.payload) || {};
        var handoffInput = {
          handoffId: payload.handoffId || randomId("handoff"),
          schema: payload.schema,
          entityType: payload.entityType,
          entityId: payload.entityId,
          data: payload.data || {},
        };
        saveHandoffJson(handoffInput);
        for (var i = 0; i < jsonHandlers.length; i++) {
          await jsonHandlers[i](handoffInput);
        }
        return {
          commandId: command.commandId,
          ok: true,
          type: type,
          action: "crm.pushJson.saved",
          message: "Handoff JSON saved",
          data: { handoffId: handoffInput.handoffId },
          receivedAt: receivedAt,
          completedAt: new Date().toISOString(),
        };
      }

      if (type === "desktop.crm.runAction") {
        var actionKey = command.target && command.target.actionKey;
        if (!actionKey || !registeredActions.has(actionKey)) {
          throw new Error("action not registered: " + actionKey);
        }
        var handler = registeredActions.get(actionKey);
        var actionData = await handler({
          payload: command.payload || {},
          target: command.target || {},
        });
        return {
          commandId: command.commandId,
          ok: true,
          type: type,
          action: "crm.runAction.completed",
          message: "Action executed",
          data: actionData || {},
          receivedAt: receivedAt,
          completedAt: new Date().toISOString(),
        };
      }

      if (type === "desktop.crm.clickButton") {
        var clickKey = command.target && command.target.actionKey;
        var clickSelector = command.target && command.target.selector;
        var element = findButtonElement(clickKey, clickSelector);
        if (!element || !(element instanceof HTMLElement)) {
          throw new Error("button not found");
        }
        element.click();
        return {
          commandId: command.commandId,
          ok: true,
          type: type,
          action: "crm.clickButton.completed",
          message: "Button clicked",
          receivedAt: receivedAt,
          completedAt: new Date().toISOString(),
        };
      }

      if (type === "desktop.crm.showToast") {
        var toastMessage =
          (command.payload && command.payload.message) || "Desktop command received";
        if (typeof window.alert === "function") {
          window.alert(String(toastMessage));
        }
        return {
          commandId: command.commandId,
          ok: true,
          type: type,
          action: "crm.showToast.completed",
          message: "Toast shown",
          receivedAt: receivedAt,
          completedAt: new Date().toISOString(),
        };
      }

      if (
        type === "desktop.crm.highlightField" ||
        type === "desktop.crm.focusField" ||
        type === "desktop.crm.fillField" ||
        type === "desktop.crm.scrollToSection" ||
        type === "desktop.crm.requestContext"
      ) {
        return {
          commandId: command.commandId,
          ok: true,
          type: type,
          action: type + ".completed",
          message: "Command handled",
          data: { page: collectContext() },
          receivedAt: receivedAt,
          completedAt: new Date().toISOString(),
        };
      }

      if (type === "desktop.crm.product.fillForm" || type === "desktop.crm.product.create") {
        window.dispatchEvent(
          new CustomEvent("crm-lite:desktop-command", {
            detail: command,
          }),
        );
        return {
          commandId: command.commandId,
          ok: true,
          type: type,
          action: type + ".dispatched",
          message: "Product command dispatched to page listeners",
          receivedAt: receivedAt,
          completedAt: new Date().toISOString(),
        };
      }

      throw new Error("unsupported command type: " + type);
    } catch (error) {
      return {
        commandId: command.commandId,
        ok: false,
        type: type,
        message: error instanceof Error ? error.message : String(error),
        errorCode: "COMMAND_FAILED",
        receivedAt: receivedAt,
        completedAt: new Date().toISOString(),
      };
    }
  }

  var api = {
    init: function (options) {
      if (options && typeof options === "object") {
        config.app = options.app || config.app;
        config.sdkVersion = options.sdkVersion || config.sdkVersion;
        if (typeof options.collectContext === "function") {
          config.collectContext = options.collectContext;
        }
      }
      return api;
    },
    emitReady: function (input) {
      var capabilities =
        (input && input.capabilities) ||
        ["pushJson", "runAction", "clickButton", "openForm"];
      var page = collectContext();
      var event = {
        source: "crm-web",
        sdkVersion: config.sdkVersion,
        requestId: randomId("ready"),
        type: "crm.page.ready",
        page: page,
        payload: { capabilities: capabilities },
      };

      if (window.CopilotDesktopCRM && typeof window.CopilotDesktopCRM.emitReady === "function") {
        void window.CopilotDesktopCRM.emitReady(event);
        return event;
      }

      window.postMessage(
        {
          source: SDK_SOURCE,
          channel: READY_EVENT_CHANNEL,
          event: event,
        },
        window.location.origin,
      );
      return event;
    },
    registerButton: function (actionKey, selector) {
      registeredButtons.set(actionKey, selector);
      return api;
    },
    registerAction: function (actionKey, handler) {
      registeredActions.set(actionKey, handler);
      return api;
    },
    onJson: function (handler) {
      if (typeof handler === "function") {
        jsonHandlers.push(handler);
      }
      return api;
    },
    getHandoffJson: getHandoffJson,
  };

  window.addEventListener("message", function (event) {
    if (event.origin !== window.location.origin) return;
    var message = event.data;
    if (!message || message.source !== DESKTOP_SOURCE) return;
    if (message.channel !== COMMAND_CHANNEL) return;
    if (!message.command) return;

    void executeCommand(message.command).then(function (ack) {
      if (message.replyRequired) {
        postCommandResult(ack);
      }
    });
  });

  window.CopilotCrm = api;
})();
