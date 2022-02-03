## Machinechat JEDI connector for Node-RED

Machinechat JEDI connector enables you to easily add enterprise-grade data dashboards, data storage, rules and multi-user web-based interface to any Node-RED project. Machinechat JEDI runs locally on Microsoft Windows, Raspberry Pi OS, Linux and Apple macOS.

### Manual install with npm

```sh
cd ~/.node-red
npm install @machinechat/node-red-node-machinechat
```

![Screenshot](/doc/example-screenshot.jpg)

**Server Address:** is the hostname or IP address of the machine running Machinechat JEDI software.

**Port:** is the port address that is used by Machinechat JEDI to listen for incoming data. Default is 8100.

**Target ID:** is the device ID for the data that is sent to Machinechat JEDI server. You can use a template to extract the device ID from the input data to this node. You can also specify a static device ID if the input data does not contain device ID.

**Timestamp:** is the timestamp associated with the input data to this node. You can use a template to extract the timestamp from the input data to this node. If the timestamp field is empty, Machinechat JEDI will use the arrival time of the data as the timestamp.

### **Input Data Decoding and Extraction (with example)**

```javascript
{
  "data":{
    "datetime":"2022-01-22T07:30:00Z",
    "temperature":{"value":30.54},
    "pressure":{"value":942.99}
  }
}
``` 

### Template:

is the template to extract specific data points from the input data to this node. The example illustrates extracting three values from input data to this node and assigning the data to "temperature", "pressure" and "weather\_text". These metrics will be available in Machinechat JEDI for creating dashboards, data storage and rules. If the input data to this node is in string format, the following format with double quotes must be used, for e.g: `"weather_text": " {{payload.data.weather_text}} "`

```javascript
{
  "temperature": {{payload.data.temperature.value}},
  "pressure": {{payload.data.pressure.value}}
  "weather_text": " {{payload.data.weather_text}} "
}
```
