const http = require("http");
var moment = require("moment");

module.exports = function (RED) {
  "use strict";
  var mustache = require("mustache");
  var yaml = require("js-yaml");

  function extractTokens(tokens, set) {
    set = set || new Set();
    tokens.forEach(function (token) {
      if (token[0] !== "text") {
        set.add(token[1]);
        if (token.length > 4) {
          extractTokens(token[4], set);
        }
      }
    });
    return set;
  }

  function parseContext(key) {
    var match = /^(flow|global)(\[(\w+)\])?\.(.+)/.exec(key);
    if (match) {
      var parts = {};
      parts.type = match[1];
      parts.store = match[3] === "" ? "default" : match[3];
      parts.field = match[4];
      return parts;
    }
    return undefined;
  }

  /**
   * Custom Mustache Context capable to collect message property and node
   * flow and global context
   */

  function NodeContext(
    msg,
    nodeContext,
    parent,
    escapeStrings,
    cachedContextTokens
  ) {
    this.msgContext = new mustache.Context(msg, parent);
    this.nodeContext = nodeContext;
    this.escapeStrings = escapeStrings;
    this.cachedContextTokens = cachedContextTokens;
  }

  NodeContext.prototype = new mustache.Context();

  NodeContext.prototype.lookup = function (name) {
    // try message first:
    try {
      var value = this.msgContext.lookup(name);
      if (value !== undefined) {
        if (this.escapeStrings && typeof value === "string") {
          value = value.replace(/\\/g, "\\\\");
          value = value.replace(/\n/g, "\\n");
          value = value.replace(/\t/g, "\\t");
          value = value.replace(/\r/g, "\\r");
          value = value.replace(/\f/g, "\\f");
          value = value.replace(/[\b]/g, "\\b");
        }
        return value;
      }

      // try flow/global context:
      var context = parseContext(name);
      if (context) {
        var type = context.type;
        var store = context.store;
        var field = context.field;
        var target = this.nodeContext[type];
        if (target) {
          return this.cachedContextTokens[name];
        }
      }
      return "";
    } catch (err) {
      throw err;
    }
  };

  NodeContext.prototype.push = function push(view) {
    return new NodeContext(
      view,
      this.nodeContext,
      this.msgContext,
      undefined,
      this.cachedContextTokens
    );
  };

  function isJson(str) {
    try {
      JSON.parse(str);
    } catch (e) {
      return false;
    }
    return true;
  }

  function machinechatJediCollect(config) {
    RED.nodes.createNode(this, config);
    var node = this;

    /**
     * HostURL and Port values required, TargetID optional
     */

    // node.log(JSON.stringify(config));
    this.machinechatJediHostURL = config.inputHostURL.toString();
    this.machinechatJediPort = config.inputPort.toString();
    this.machinechatJediTargetID = config.inputTargetID.toString();
    this.nodeRedVersion = RED.version();

    this.field = config.field || "payload";
    this.template = config.template;
    this.syntax = config.syntax || "mustache";
    this.fieldType = config.fieldType || "msg";
    this.outputFormat = config.output || "str";

    this.getDateTime = config.inputDateTime.toString();

    this.setDateTime = '';

    this.isDateTime = undefined;

    function output(msg, value, send, done) {
      var req,
        data,
        httpConfig,
        payload = JSON.parse(value);

      /* istanbul ignore else  */
      if (node.outputFormat === "json") {
        value = JSON.parse(value);
      }
      /* istanbul ignore else  */
      if (node.outputFormat === "yaml") {
        value = yaml.load(value);
      }

      if (node.fieldType === "msg") {
        // MachineChat JEDI HTTP Data Collector payload data Object for timestamp and without timestamp

        if (node.getDateTime === "") {
          data = JSON.stringify({
            context: {
              target_id: node.machinechatJediTargetID
            },
            data: payload,
          });
        } else {
          data = JSON.stringify({
            context: {
              target_id: node.machinechatJediTargetID,
              timestamp: node.setDateTime
            },
            data: payload,
          });
        }

        // http config setup for MachineChat JEDI HTTP Data Collector
        httpConfig = {
          hostname: node.machinechatJediHostURL,
          port: node.machinechatJediPort,
          path: "/v1/data/mc",
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(data),
          },
        };

        req = http.request(httpConfig, (res) => {
          res.setEncoding("utf8");
          res.on("data", (chunk) => {
            // node.log(`BODY: ${chunk}`);
            // If we make it this far, we'll update status
            node.status({
              fill: res.statusCode === 200 ? "green" : "red",
              shape: "dot",
              text: chunk,
            });
          });
          res.on("end", () => {
            // node.log("No more data in response.");
          });
        });

        // error path
        req.on("error", (e) => {
          node.error(`problem with request: ${e.message}`);
          node.status({ fill: "red", shape: "dot", text: e.message });
        });

        // Write data to request body
        req.write(data);
        req.end();

        RED.util.setMessageProperty(msg, node.field, value);
        send(msg);
        done();
      } else if (node.fieldType === "flow" || node.fieldType === "global") {
        var context = RED.util.parseContextStore(node.field);
        var target = node.context()[node.fieldType];
        target.set(context.key, value, context.store, function (err) {
          if (err) {
            done(err);
          } else {
            send(msg);
            done();
          }
        });
      }
    }

    node.on("input", function (msg, send, done) {
      // check if payload is JSON and parse
      if (isJson(msg.payload)) {
        msg.payload = JSON.parse(msg.payload);
      }

      // Read TargetID from inputTargetID field
      node.machinechatJediTargetID = mustache.render(
        node.machinechatJediTargetID,
        new NodeContext(msg, node.context(), null, is_json, resolvedTokens)
      );

      // Read Date Time from inputDateTime field
      var dataTime = mustache.render(
        node.getDateTime,
        new NodeContext(msg, node.context(), null, is_json, resolvedTokens)
      );

      // check the input Data Time is unix
      var isUnixTime = moment(dataTime, "X", true).isValid();
      var checkDateTime = "";
      
      // check the value for a Date Time format
      if (isUnixTime) {
        checkDateTime = moment.unix(dataTime).format();
        node.isDateTime = isUnixTime.isValid();
      } else {
        checkDateTime = moment(dataTime, "YYYY-MM-DDTHH:mm:ssZZ");
        node.isDateTime = checkDateTime.isValid();
      }

      if (node.getDateTime !== "") {
        if (node.isDateTime) {
          // Set ISO format (ISO 8601)
          // Format date to Time Zone : 2021-04-14T02:22:33-0700
          if (isUnixTime) {
            node.setDateTime = checkDateTime;
          } else {
            var d = moment(dataTime);
            var format = moment(d).format();
            node.setDateTime = format;
          }
        } else {
          // error path stop execution
          node.status({
            fill: "red",
            shape: "dot",
            text: "Invalid date time or timestamp value",
          });
          return;
        }
      }

      try {
        /***
         * Allow template contents to be defined externally
         * through inbound msg.template IFF node.template empty
         */
        var template = node.template;
        if (msg.hasOwnProperty("template")) {
          if (template == "" || template === null) {
            template = msg.template;
          }
        }

        if (node.syntax === "mustache") {
          var is_json = node.outputFormat === "json";
          var promises = [];
          var tokens = extractTokens(mustache.parse(template));
          var resolvedTokens = {};
          tokens.forEach(function (name) {
            var context = parseContext(name);
            if (context) {
              var type = context.type;
              var store = context.store;
              var field = context.field;
              var target = node.context()[type];
              if (target) {
                var promise = new Promise((resolve, reject) => {
                  target.get(field, store, (err, val) => {
                    if (err) {
                      reject(err);
                    } else {
                      resolvedTokens[name] = val;
                      resolve();
                    }
                  });
                });
                promises.push(promise);
                return;
              }
            }
          });

          Promise.all(promises)
            .then(function () {
              var value = mustache.render(
                template,
                new NodeContext(
                  msg,
                  node.context(),
                  null,
                  is_json,
                  resolvedTokens
                )
              );
              output(msg, value, send, done);
            })
            .catch(function (err) {
              done(err.message);
            });
        } else {
          output(msg, template, send, done);
        }
      } catch (err) {
        done(err.message);
      }
    });
  }

  RED.nodes.registerType("machinechat-jedi-connector", machinechatJediCollect);
  RED.library.register("machinechat-jedi-connector");
};
