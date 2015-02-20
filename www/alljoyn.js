var argscheck = require('cordova/argscheck'),
  utils = require('cordova/utils'),
  exec = require('cordova/exec'),
  cordova = require('cordova');

var registeredObjects = [];

var getSignature = function(indexList, objectsList) {
  var objects = objectsList[indexList[0]];
  var object = objects[indexList[1]];
  var interfaces = object.interfaces;
  var signature = interfaces[indexList[2]][indexList[3] + 1];
  return signature;
};

var getSignalRuleString = function(member, interface) {
  return "type='signal',member='" + member + "',interface='" + interface + "'";
};

var AllJoyn = {
  connect: function(success, error) {
    var successCallback = function() {
      var bus = {
        addListener: function(indexList, responseType, listener) {
          // We are passing the listener function to the exec call as its success callback, but in this case,
          // it is expected that the callback can be called multiple times. The error callback is passed just because
          // exec requires it, but it is not used for anything.
          // The listener is also passed as a parameter, because in the Windows implementation, the success callback
          // can't be called multiple times.
          exec(listener, function() {}, "AllJoyn", "addListener", [indexList, responseType, listener]);
        },
        // joinSessionRequest = {
        //   port: 12,
        //   sender: "afa-f",
        //   sessionId: 123,
        //   response: function // to be called with either true or false
        // }
        // Usage: bus.acceptSessionListener = myListenerFunction(joinSessionRequest);
        acceptSessionListener: function(joinSessionRequest) {
          joinSessionRequest.response(true);
        },
        addSignalRule: function(success, error, member, interfaceName) {
          var ruleString = getSignalRuleString(member, interfaceName);
          exec(success, error, "AllJoyn", "setSignalRule", [ruleString, 0]);
        },
        removeSignalRule: function(success, error, member, interfaceName) {
          var ruleString = getSignalRuleString(member, interfaceName);
          exec(success, error, "AllJoyn", "setSignalRule", [ruleString, 1]);
        },
        /*
         * When name found, listener is called with parameter { name: "the.name.found" }
         */
        addAdvertisedNameListener: function(name, listener) {
          exec(listener, function() {}, "AllJoyn", "addAdvertisedNameListener", [name, listener]);
        },
        addInterfacesListener: function(interfaceNames, listener) {
          var aboutAnnouncementRule = "interface='org.alljoyn.About',sessionless='t'";
          if (interfaceNames) {
            if (interfaceNames.constructor !== Array) {
              interfaceNames = [interfaceNames];
            }
            interfaceNames.forEach(function(currentValue, index, array) {
              aboutAnnouncementRule += ",implements='" + currentValue + "'";
            });
          }

          console.log('aboutAnnouncementRule: ' + aboutAnnouncementRule);
          var onAboutAnnouncementReceived = function(messageBody) {
            var aboutAnnouncement = {};
            console.log('onAboutAnnouncementReceived: ' + JSON.stringify(arguments));
            if (messageBody) {
              if (messageBody[0]) {
                aboutAnnouncement.version = messageBody[0];
              }
              if (messageBody[1]) {
                aboutAnnouncement.port = messageBody[1];
              }
              if (messageBody[2] && messageBody[2].constructor === Array) {
                aboutAnnouncement.objects = [];
                messageBody[2].forEach(function(objectDescription) {
                  if (objectDescription.constructor === Array) {
                    var object = {};
                    object.path = objectDescription[0];
                    object.interfaces = objectDescription[1];
                    aboutAnnouncement.objects.push(object);
                  }
                });
              }
              if (messageBody[3] && messageBody[3].constructor === Array) {
                messageBody[3].forEach(function(objectProperty) {
                  if (objectProperty.constructor === Array) {
                    aboutAnnouncement[objectProperty[0]] = objectProperty[1];
                  }
                });
              }
            }

            console.log('AboutAnnouncement: ' + JSON.stringify(aboutAnnouncement));
            listener(aboutAnnouncement);

          };
          var onAddAboutAnnouncementRuleSuccess = function() {
            var aboutAnnouncementIndexList = [0, 5, 1, 3]; // AJ_SIGNAL_ABOUT_ANNOUNCE
            bus.addListener(aboutAnnouncementIndexList, 'qqa(oas)a{sv}', onAboutAnnouncementReceived);
          };
          exec(onAddAboutAnnouncementRuleSuccess, function() {}, "AllJoyn", "setSignalRule", [aboutAnnouncementRule, 0]);

          // exec(listener, function() {}, "AllJoyn", "addInterfacesListener", [interfaceNames, listener]);
        },
        startAdvertisingName: function(success, error, name, port) {
          exec(success, error, "AllJoyn", "startAdvertisingName", [name, port]);
        },
        stopAdvertisingName: function(success, error, name, port) {
          exec(success, error, "AllJoyn", "stopAdvertisingName", [name, port]);
        },
        /*
              var service = {
                name: "name.of.the.service",
                port: 12
              };
         */
        joinSession: function(success, error, service) {
          var successCallback = function(result) {
            var sessionId = result[0];
            var sessionHost = result[1];
            var session = {
              sessionId: sessionId,
              sessionHost: sessionHost,
              callMethod: function(callMethodSuccess, callMethodError, destination, path, indexList, inParameterType, parameters, outParameterType) {
                var signature = getSignature(indexList, registeredObjects);
                exec(callMethodSuccess, callMethodError, "AllJoyn", "invokeMember", [sessionId, destination, signature, path, indexList, inParameterType, parameters, outParameterType]);
              },
              sendSignal: function(sendSignalSuccess, sendSignalError, destination, path, indexList, inParameterType, parameters) {
                var signature = getSignature(indexList, registeredObjects);
                exec(sendSignalSuccess, sendSignalError, "AllJoyn", "invokeMember", [sessionId, destination, signature, path, indexList, inParameterType, parameters]);
              },
              leave: function(leaveSuccess, leaveError) {
                exec(leaveSuccess, leaveError, "AllJoyn", "leaveSession", [sessionId]);
              }
            };
            success(session);
          };

          exec(successCallback, error, "AllJoyn", "joinSession", [service]);
        },
        sendSignal: function(sendSignalSuccess, sendSignalError, indexList, inParameterType, parameters) {
          var signature = getSignature(indexList, registeredObjects);
          exec(sendSignalSuccess, sendSignalError, "AllJoyn", "invokeMember", [null, null, signature, null, indexList, inParameterType, parameters]);
        }
      };

      var acceptSessionListener = function(messageBody, messagePointer, doneCallback) {
        var getClass = {}.toString;
        var responseCallback = function(response) {
          exec(function() {}, function() {}, "AllJoyn", "replyAcceptSession", [messagePointer, response]);
          if (doneCallback && getClass.call(doneCallback) == '[object Function]') {
            doneCallback();
          }
        };

        var joinSessionRequest = {
          port: messageBody[0],
          sessionId: messageBody[1],
          sender: messageBody[2],
          response: responseCallback,
        };
        bus.acceptSessionListener(joinSessionRequest);
      };
      exec(acceptSessionListener, function() {}, "AllJoyn", "setAcceptSessionListener", [acceptSessionListener]);

      success(bus);
    };
    exec(successCallback, error, "AllJoyn", "connect", ["", 5000]);
  },
  registerObjects: function(success, error, applicationObjects, proxyObjects) {
    exec(function() {
      registeredObjects = [null, applicationObjects, proxyObjects];
      success();
    }, error, "AllJoyn", "registerObjects", [applicationObjects, proxyObjects]);
  },
  AJ_OK: 0
};

module.exports = AllJoyn;