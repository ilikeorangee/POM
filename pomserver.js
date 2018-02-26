    // Message Formats
var MessageFormat = {};
var REQUEST             = MessageFormat.REQUEST         = 0;
var REPLY               = MessageFormat.REPLY           = 1;
var NOTIFICATION        = MessageFormat.NOTIFICATION    = 2;
var TEMPOREQUEST        = MessageFormat.TEMPOREQUEST    = 3;

// Node Types
var NodeType = {};
var NO_NODE             = NodeType.NO_NODE              = 0;
var ELEMENT_NODE        = NodeType.ELEMENT_NODE         = 1;
var ATTRIBUTE_NODE      = NodeType.ATTRIBUTE_NODE       = 2;
var TEXT_NODE           = NodeType.TEXT_NODE            = 3;

// Actions
var Action = {};
var REGISTER                 = Action.REGISTER               = 0;
var GET_VALUE                = Action.GET_VALUE              = 1;
var SET_VALUE                = Action.SET_VALUE              = 2;
var INSERT_NODE              = Action.INSERT_NODE            = 3;
var REMOVE_NODE              = Action.REMOVE_NODE            = 4;
var SUBSCRIBE                = Action.SUBSCRIBE              = 5;
var UNSUBSCRIBE              = Action.UNSUBSCRIBE            = 6;
var ADD_SERVICE              = Action.ADD_SERVICE            = 7;
var DROP_SERVICE             = Action.DROP_SERVICE           = 8;
var LOCATE_SERVICE           = Action.LOCATE_SERVICE         = 9;
var SET_TEMPORAL_TIME        = Action.SET_TEMPORAL_TIME      = 10;

// Statuses
var Status = {};
var REQUEST_COMPLETE    = Status.REQUEST_COMPLETE       = 0;
var REQUEST_ERROR       = Status.REQUEST_ERROR          = 1;

// Mutation Events
var MutationEvent = {};
var SUBTREE_MODIFIED        = MutationEvent.SUBTREE_MODIFIED            = 0;
var ELEMENT_INSERTED        = MutationEvent.ELEMENT_INSERTED            = 1;
var ELEMENT_REMOVED         = MutationEvent.ELEMENT_REMOVED             = 2;
var ATTR_MODIFIED           = MutationEvent.ATTR_MODIFIED               = 3;
var CHARACTER_DATA_MODIFIED = MutationEvent.CHARACTER_DATA_MODIFIED     = 4;

// Registration Events
var RegistrationEvent = {};
var DEVICE_REGISTERED       = RegistrationEvent.DEVICE_REGISTERED       = 5;
var DEVICE_UNREGISTERED     = RegistrationEvent.DEVICE_UNREGISTERED     = 6;

// Search Events
var SearchEvent = {};
var SERVICE_REQUEST         = SearchEvent.SERVICE_REQUEST               = 7;
var SERVICE_LOCATED         = SearchEvent.SERVICE_LOCATED               = 8;

// Attribute Change Types
var AttrChangeType = {};
var ADDITION            = AttrChangeType.ADDITION       = 1;
var MODIFICATION        = AttrChangeType.MODIFICATION   = 2;
var REMOVAL             = AttrChangeType.REMOVAL        = 3;

// Global Variables
var fs = require('fs'),
    net = require('net'),
    events = require('events'),
    DOMParser = require('xmldom').DOMParser,
    DocumentEvent = require('xmldom').DocumentEvent,
    rs = fs.createReadStream('serverPOM.xml'),
    fileContents = '',
    serverPOM = '',
    searchPOM = '',
    serverID,
    defines,
    server;

// Main Program
rs.on('data', function(data) {
    fileContents = fileContents.concat(data);
});

rs.on('end', function() {
    var root;

    console.log('POM has been loaded');
    serverPOM = new DOMParser().parseFromString(fileContents, 'text/xml');
    serverPOM.startLogging();
    console.log(stringifyPOM(serverPOM));
    root = serverPOM.getElementsByTagName('device')[0];

    if (!root) {
        console.log('Invalid POM document: no root device. Exiting...');
        return;
    }
    serverID = root.getAttribute('id');
    defines = serverPOM.getElementById('defs');

    server.listen(8000, function() {
        console.log('Listening for requests...');
    });
});

function stringifyPOM(pom) {
    var pomString = pom.toString().replace(/[\r\n\t]/g,'') + '\0',
        formatted = '',
        reg = /(>)(<)(\/*)/g,
        pad = 0;

    pomString = pomString.replace(reg, '$1\r\n$2$3');
    pomString.split('\r\n').map( function(node) {
        var padding = '',
            indent = 0,
            index = 0;

        if (node.match( /.+<\/\w[^>]*>$/ ))
            indent = 0;
        else if (node.match( /^<\/\w/ ) && pad != 0)
            pad -= 1;
        else if (node.match( /^<\w[^>]*[^\/]>.*$/ ))
            indent = 1;
        else
           indent = 0;

        for (index = 0; index < pad; index++)
            padding += '\t';

        formatted += padding + node + '\n';
        pad += indent;
    });
    return formatted.substring(0, formatted.length - 1);
}

function getTextNode(node) {
    var children = node.childNodes,
        len = children.length,
        textNode;

    for (var i = 0; i < len; i++) {
        if (children[i].nodeType === NodeType.TEXT_NODE) {
            textNode = children[i];
            break;
        }
    }
    return textNode;
}

// Server Object
server = net.createServer(function (socket) {
    var clientIP = socket.remoteAddress.valueOf(),
    	clientPOM,
    	clientID,
        space,
        device,
        devType,
        timestamp,
        verify,
        timer,
        timeout = 600000,
        registered = false,
        eventListeners = [];

    console.log('Client ' + clientIP + ' has connected');
    socket.setEncoding('utf8');
    timestamp = new Date().getTime();

    verify = function() {
        var evt;

        if ((new Date().getTime() - timestamp) > timeout) {
            console.log('Client ' + clientIP + ' has timed out. Dropping connection...');
            socket.destroy();
            unregisterClient();
            return;
        }
        timer = setTimeout(verify, timeout);
    };
    timer = setTimeout(verify, timeout);


    socket.on('data', function(data) {
        var jdata;

        if (!registered) {
            registerClient(data);
            return;
        }
        jdata = JSON.parse(data);

        if (jdata.format === MessageFormat.REQUEST) {
            switch (jdata.type) {
                case NodeType.ELEMENT_NODE      : elementRequest(jdata);                                break;
                case NodeType.ATTRIBUTE_NODE    : attrRequest(jdata);                                   break;
                default                         : replyError(type, jdata.action, 'Invalid node type');  break;
            }
        } else if (jdata.format === MessageFormat.TEMPOREQUEST) {
            switch (jdata.type) {
                case NodeType.ELEMENT_NODE      : elementRequest(jdata, true);                          break;
                case NodeType.ATTRIBUTE_NODE    : attrRequest(jdata, true);                             break;
                case NodeType.NO_NODE           : temporalRequest(jdata);                               break;
            }

        }
        timestamp = new Date().getTime();
    });

    socket.on('end', function() {
        var evt;
        unregisterClient();
    });

    socket.on('error', function() {
        console.log('Connection error...');
        unregisterClient();
    });

    function unregisterClient() {
        console.log('Client '+ clientIP + ' has disconnected');
        clearTimeout(timer);

        if (registered) {
            purgeEventListeners();
            space.removeChild(device);

            evt = new DocumentEvent().createEvent(DocumentEvent.REGISTRATION_EVENT);
            evt.initRegistrationEvent(RegistrationEvent.DEVICE_UNREGISTERED, true, false, clientID, devType, space.getAttribute('id'));
            space.dispatchEvent(evt);

            console.log(stringifyPOM(serverPOM));
        }
    }

    function registerClient(clientPOM) {
        var elemNode,
            textNode,
            oldValue,
            location,
            response,
            evt;

        console.log('Registering client...');
        try {
            clientPOM = new DOMParser().parseFromString(clientPOM, 'text/xml');
            device = clientPOM.getElementsByTagName('device')[0];
        }
        catch(e) {
            replyError(NodeType.ELEMENT_NODE, Action.REGISTER, 'Invalid POM document');
            return;
        }
        elemNode = device.getElementsByTagName('ipaddr')[0];

        if (!elemNode) {
            replyError(NodeType.ELEMENT_NODE, Action.REGISTER, 'Invalid POM document: no IP element');
            return;
        }
        textNode = getTextNode(elemNode);

        if (!textNode) {
            textNode = clientPOM.createTextNode(clientIP);
            elemNode.appendChild(textNode);
        }
        else {
            oldValue = textNode.nodeValue.trim();
            start = textNode.nodeValue.search(oldValue);
            textNode.replaceData(start, oldValue.length, clientIP);
        }
        elemNode = device.getElementById('tp');

        if (!elemNode) {
            replyError(NodeType.ELEMENT_NODE, Action.REGISTER, 'Invalid POM document: no type element');
            return;
        }
        devType = getTextNode(elemNode).nodeValue.trim();
        elemNode = device.getElementById('loc');

        if (!elemNode) {
            replyError(NodeType.ELEMENT_NODE, Action.REGISTER, 'Invalid POM document: no location element');
            return;
        }
        location = getTextNode(elemNode).nodeValue.trim();
        space = defines.getElementById(location);
        // error handling if location is not exist

        // POM ACTION
        space.appendChild(device);

        registered = true;
        clientID = device.getAttribute('id');
        console.log(stringifyPOM(serverPOM));
        response = {
            'format'    : MessageFormat.REPLY,
            'type'      : NodeType.ELEMENT_NODE,
            'action'    : Action.REGISTER,
            'status'    : Status.REQUEST_COMPLETE,
            'deviceID'  : clientID,
            'serverID'  : serverID
        };
        socket.write(JSON.stringify(response) + '\0');

        evt = new DocumentEvent().createEvent(DocumentEvent.REGISTRATION_EVENT);
        evt.initRegistrationEvent(RegistrationEvent.DEVICE_REGISTERED, true, false, clientID, devType, location);
        device.dispatchEvent(evt);
    }

    function elementRequest(jdata, temporal) {
        var deviceNode,
            elementNode,
            serverNode;

        if (temporal)
            serverNode = serverPOM.TemporalNode;
        else
            serverNode = serverPOM;

        if (!serverNode) {
            replyError(NodeType.ELEMENT_NODE, jdata.action, 'Temporal Instance not started');
            return;
        }

        deviceNode = serverNode.getElementById(jdata.deviceID);
        if (!deviceNode) {
            replyError(NodeType.ELEMENT_NODE, jdata.action, 'Invalid device ID');
            return;
        }
        if (jdata.action === Action.INSERT_NODE) {
            insertElementNode(jdata, deviceNode);
            return;
        }
        elementNode = deviceNode.getElementById(jdata.elementID);

        if (elementNode) {
            switch (jdata.action) {
                case Action.GET_VALUE       : getElementValue(jdata, elementNode);                                  break;
                case Action.SET_VALUE       : setElementValue(jdata, elementNode);                                  break;
                case Action.REMOVE_NODE     : removeElementNode(jdata, elementNode);                                break;
                case Action.SUBSCRIBE       : subscribeEvent(jdata, elementNode);                                   break;
                case Action.UNSUBSCRIBE     : unsubscribeEvent(jdata, elementNode);                                 break;
                case Action.ADD_SERVICE     : addService(jdata, elementNode);                                       break;
                case Action.DROP_SERVICE    : dropService(jdata, elementNode);                                      break;
                case Action.LOCATE_SERVICE  : locateService(jdata, elementNode);                                    break;
                default                     : replyError(NodeType.ELEMENT_NODE, jdata.action, 'Invalid action');    break;
            }
        }
        else replyError(NodeType.ELEMENT_NODE, jdata.action, 'Invalid element ID');
    }

    function getElementValue(jdata, elementNode) {
        var textNode,
            value,
            response;

        textNode = getTextNode(elementNode);

        if (!textNode) {
            replyError(NodeType.ELEMENT_NODE, jdata.action, 'Element value is undefined');
            return;
        }
        value = (textNode.nodeValue).trim();

        if (!value.length) value = ' ';
        response = {
            'format'    : MessageFormat.REPLY,
            'type'      : NodeType.ELEMENT_NODE,
            'action'    : Action.GET_VALUE,
            'status'    : Status.REQUEST_COMPLETE,
            'deviceID'  : jdata.deviceID,
            'elementID' : elementNode.getAttribute('id'),
            'value'     : value
        };
        socket.write(JSON.stringify(response) + '\0');
    }

    function setElementValue(jdata, elementNode) {
        var textNode,
            oldValue,
            start,
            response,
            evt;

        console.log('Updating POM...');
        textNode = getTextNode(elementNode);
        oldValue = textNode.nodeValue.trim();
        start = textNode.nodeValue.search(oldValue);
        // POM ACTION
        textNode.replaceData(start, oldValue.length, jdata.value);
        response = {
            'format'    : MessageFormat.REPLY,
            'type'      : NodeType.ELEMENT_NODE,
            'action'    : Action.SET_VALUE,
            'status'    : Status.REQUEST_COMPLETE,
            'deviceID'  : jdata.deviceID,
            'elementID' : elementNode.getAttribute('id'),
            'value'     : textNode.nodeValue.trim()
        };
        console.log(stringifyPOM(serverPOM));
        socket.write(JSON.stringify(response) + '\0');

        evt = new DocumentEvent().createEvent(DocumentEvent.MUTATION_EVENT);
        evt.initMutationEvent(MutationEvent.CHARACTER_DATA_MODIFIED, true, false, textNode, oldValue, jdata.value);
        textNode.dispatchEvent(evt);
    }

    function insertElementNode(jdata, deviceNode){
        var parentNode,
            elementNode,
            textNode,
            response,
            evt;

        parentNode = deviceNode.getElementById(jdata.parentID);

        if (!parentNode) {
            replyError(NodeType.ELEMENT_NODE, Action.INSERT_NODE, 'Invalid parent ID');
            return;
        }
        console.log('Updating POM...');
        // POM ACTION
        elementNode = serverPOM.createElement(jdata.tag);
        elementNode.setAttribute("id", jdata.elementID);
        parentNode.appendChild(elementNode);
        textNode = serverPOM.createTextNode(jdata.value);
        elementNode.appendChild(textNode);
        response = {
            'format'    : MessageFormat.REPLY,
            'type'      : NodeType.ELEMENT_NODE,
            'action'    : Action.INSERT_NODE,
            'status'    : Status.REQUEST_COMPLETE,
            'deviceID'  : deviceNode.getAttribute('id'),
            'parentID'  : parentNode.getAttribute('id'),
            'tag'       : elementNode.nodeName,
            'elementID' : elementNode.getAttribute('id'),
            'value'     : textNode.nodeValue.trim()
        };
        console.log(stringifyPOM(serverPOM));
        socket.write(JSON.stringify(response) + '\0');

        evt = new DocumentEvent().createEvent(DocumentEvent.MUTATION_EVENT);
        evt.initMutationEvent(MutationEvent.ELEMENT_INSERTED, true, false, parentNode);
        elementNode.dispatchEvent(evt);
    }

    function removeElementNode(jdata, elementNode){
        var parentNode = elementNode.parentNode,
            childNodes = elementNode.childNodes,
            len = childNodes.length,
            response,
            evt;

        if (elementNode.nodeName === 'device') {
            replyError(NodeType.ELEMENT_NODE, jdata.action, 'Cannot remove device node');
            return;
        }
        evt = new DocumentEvent().createEvent(DocumentEvent.MUTATION_EVENT);
        evt.initMutationEvent(MutationEvent.ELEMENT_REMOVED, true, false, parentNode);
        elementNode.dispatchEvent(evt);

        console.log('Updating POM...');
        // POM ACTION
        parentNode.removeChild(elementNode);

        // Why append child nodes to parent node?
        for (var i = 0; i < len; i++) {
            if (childNodes[i].nodeType === NodeType.ELEMENT_NODE)
                // POM ACTION
                parentNode.appendChild(childNodes[i]);
        }
        response = {
            'format'    : MessageFormat.REPLY,
            'type'      : NodeType.ELEMENT_NODE,
            'action'    : Action.REMOVE_NODE,
            'status'    : Status.REQUEST_COMPLETE,
            'deviceID'  : jdata.deviceID,
            'elementID' : elementNode.getAttribute('id')
        };
        console.log(stringifyPOM(serverPOM));
        socket.write(JSON.stringify(response) + '\0');
    }

    function attrRequest(jdata, temporal) {
        var deviceNode,
            elementNode,
            attrNode,
            serverNode;
        if (temporal)
            serverNode = serverPOM.TemporalNode;
        else
            serverNode = serverPOM;

        if (!serverNode) {
            replyError(NodeType.ELEMENT_NODE, jdata.action, 'Temporal Instance not started');
            return;
        }

        deviceNode = serverNode.getElementById(jdata.deviceID);
        if (!deviceNode) {
            replyError(NodeType.ATTRIBUTE_NODE, jdata.action, 'Invalid device ID');
            return;
        }
        elementNode = deviceNode.getElementById(jdata.elementID);

        if (elementNode) {
            if (jdata.action === Action.INSERT_NODE) {
                insertAttrNode(jdata, elementNode);
                return;
            }
            attrNode = elementNode.getAttributeNode(jdata.attr);
            if (attrNode) {
                switch (jdata.action) {
                    case Action.GET_VALUE   : getAttrValue(jdata, attrNode);                                        break;
                    case Action.SET_VALUE   : setAttrValue(jdata, elementNode, attrNode);                           break;
                    case Action.REMOVE_NODE : removeAttrNode(jdata, elementNode, attrNode);                         break;
                    default                 : replyError(NodeType.ATTRIBUTE_NODE, jdata.action, 'Invalid action');  break;
                }
            }
            else replyError(NodeType.ATTRIBUTE_NODE, jdata.action, 'Invalid attribute name');
        }
        else replyError(NodeType.ATTRIBUTE_NODE, jdata.action, 'Invalid element ID');
    }

    function getAttrValue(jdata, attrNode) {
        var  response = {
            'format'    : MessageFormat.REPLY,
            'type'      : NodeType.ATTRIBUTE_NODE,
            'action'    : Action.GET_VALUE,
            'status'    : Status.REQUEST_COMPLETE,
            'deviceID'  : jdata.deviceID,
            'elementID' : jdata.elementID,
            'attr'      : attrNode.nodeName,
            'value'     : attrNode.nodeValue
        };
        socket.write(JSON.stringify(response) + '\0');
    }

    function setAttrValue(jdata, elementNode, attrNode) {
        var oldValue,
            response,
            evt;

        console.log('Updating POM...');
        oldValue = attrNode.nodeValue;
        // POM ACTION
        elementNode.setAttribute(jdata.attr, jdata.value);
        attrNode = elementNode.getAttributeNode(jdata.attr);
        response = {
            'format'    : MessageFormat.REPLY,
            'type'      : NodeType.ATTRIBUTE_NODE,
            'action'    : Action.SET_VALUE,
            'status'    : Status.REQUEST_COMPLETE,
            'deviceID'  : jdata.deviceID,
            'elementID' : elementNode.getAttribute('id'),
            'attr'      : attrNode.nodeName,
            'value'     : attrNode.nodeValue
        };
        console.log(stringifyPOM(serverPOM));
        socket.write(JSON.stringify(response) + '\0');

        evt = new DocumentEvent().createEvent(DocumentEvent.MUTATION_EVENT);
        evt.initMutationEvent(MutationEvent.ATTR_MODIFIED, true, false, elementNode, oldValue, jdata.value, attrNode.nodeName, AttrChangeType.MODIFICATION);
        elementNode.dispatchEvent(evt);
    }

    function insertAttrNode(jdata, elementNode) {
        var attrNode,
            response,
            evt;

        console.log('Updating POM...');
        // POM ACTION
        elementNode.setAttribute(jdata.attr, jdata.value);
        attrNode = elementNode.getAttributeNode(jdata.attr);
        response = {
            'format'    : MessageFormat.REPLY,
            'type'      : NodeType.ATTRIBUTE_NODE,
            'action'    : Action.INSERT_NODE,
            'status'    : Status.REQUEST_COMPLETE,
            'deviceID'  : jdata.deviceID,
            'elementID' : elementNode.getAttribute('id'),
            'attr'      : attrNode.nodeName,
            'value'     : attrNode.nodeValue
        };
        console.log(stringifyPOM(serverPOM));
        socket.write(JSON.stringify(response) + '\0');

        evt = new DocumentEvent().createEvent(DocumentEvent.MUTATION_EVENT);
        evt.initMutationEvent(MutationEvent.ATTR_MODIFIED, true, false, elementNode, null, jdata.value, jdata.attr, AttrChangeType.ADDITION);
        elementNode.dispatchEvent(evt);
    }

    function removeAttrNode(jdata, elementNode, attrNode) {
        var response,
            evt;

        console.log('Updating POM...');
        // POM ACTION
        elementNode.removeAttribute(jdata.attr);
        response = {
            'format'    : MessageFormat.REPLY,
            'type'      : NodeType.ATTRIBUTE_NODE,
            'action'    : Action.REMOVE_NODE,
            'status'    : Status.REQUEST_COMPLETE,
            'deviceID'  : jdata.deviceID,
            'elementID' : elementNode.getAttribute('id'),
            'attr'      : attrNode.nodeName,
        };
        console.log(stringifyPOM(serverPOM));
        socket.write(JSON.stringify(response) + '\0');

        evt = new DocumentEvent().createEvent(DocumentEvent.MUTATION_EVENT);
        evt.initMutationEvent(MutationEvent.ATTR_MODIFIED, true, false, elementNode, attrNode.nodeValue, null, attrNode.nodeName, AttrChangeType.REMOVAL);
        elementNode.dispatchEvent(evt);
    }

    function subscribeEvent(jdata, elementNode) {
        var listener,
            response,
            capture = jdata.capture ? true : false,
            len = eventListeners.length;

        for (var i = 0; i < len; i++) {
            if (eventListeners[i].type === jdata.event &&
                eventListeners[i].listener.node === elementNode &&
                eventListeners[i].useCapture === capture) {
                    eventListeners.splice(i, 1);
                    break;
            }
        }
        listener = { 'node' : elementNode, 'handleEvent' : notifyClient };
        // POM ACTION
        elementNode.addEventListener(jdata.event, listener, capture);
        eventListeners.push({'type' : jdata.event, 'listener' : listener, 'useCapture' : capture});
        response = {
            'format'    : MessageFormat.REPLY,
            'type'      : NodeType.ELEMENT_NODE,
            'action'    : Action.SUBSCRIBE,
            'status'    : Status.REQUEST_COMPLETE,
            'deviceID'  : jdata.deviceID,
            'elementID' : elementNode.getAttribute('id'),
            'event'     : jdata.event,
            'capture'   : jdata.capture
        };
        socket.write(JSON.stringify(response) + '\0');
    }

    function unsubscribeEvent(jdata, elementNode) {
        var listener,
            response,
            capture = jdata.capture ? true : false,
            len = eventListeners.length;

        for (var i = 0; i < len; i++) {
            if (eventListeners[i].type === jdata.event &&
                eventListeners[i].listener.node === elementNode &&
                eventListeners[i].useCapture === capture) {
                    listener = eventListeners[i].listener;
                    eventListeners.splice(i, 1);
                    break;
            }
        }
        elementNode.removeEventListener(jdata.event, listener, capture);
        response = {
            'format'    : MessageFormat.REPLY,
            'type'      : NodeType.ELEMENT_NODE,
            'action'    : Action.UNSUBSCRIBE,
            'status'    : Status.REQUEST_COMPLETE,
            'deviceID'  : jdata.deviceID,
            'elementID' : elementNode.getAttribute('id'),
            'event'     : jdata.event,
            'capture'   : jdata.capture,
        };
        socket.write(JSON.stringify(response) + '\0');
    }

    function addService(jdata, elementNode) {
        var listener,
            response,
            len;

        if (elementNode.nodeName !== 'space') {
            replyError(ELEMENT_NODE, ADD_SERVICE, 'ID does not refer to a space');
            return;
        }
        if (!elementNode.getElementById(clientID)) {
            replyError(ELEMENT_NODE, ADD_SERVICE, 'Space does not contain client');
            return;
        }
        len = eventListeners.length;

        for (var i = 0; i < len; i++) {
            if (eventListeners[i].type === jdata.event &&
                eventListeners[i].listener.node === elementNode &&
                eventListeners[i].listener.service === jdata.service) {
                    replyError(ELEMENT_NODE, ADD_SERVICE, 'Service already exists');
                    break;
            }
        }
        listener = {
            'node'        : elementNode,
            'handleEvent' : serviceRequest,
            'service'     : jdata.service,
            'controlID'   : jdata.controlID
        };
        elementNode.addEventListener(jdata.event, listener, false);
        eventListeners.push({'type' : jdata.event, 'listener' : listener, 'useCapture' : false});
        response = {
            'format'    : MessageFormat.REPLY,
            'type'      : NodeType.ELEMENT_NODE,
            'action'    : Action.ADD_SERVICE,
            'status'    : Status.REQUEST_COMPLETE,
            'deviceID'  : jdata.deviceID,
            'elementID' : elementNode.getAttribute('id'),
            'event'     : jdata.event,
            'service'   : jdata.service,
            'controlID' : jdata.controlID
        };
        socket.write(JSON.stringify(response) + '\0');
    }

    function dropService(jdata, elementNode) {
        var listener,
            response,
            found,
            len;

        if (elementNode.nodeName !== 'space') {
            replyError(ELEMENT_NODE, ADD_SERVICE, 'ID does not refer to a space');
            return;
        }
        if (!elementNode.getElementById(clientID)) {
            replyError(ELEMENT_NODE, ADD_SERVICE, 'Space does not contain client');
            return;
        }
        len = eventListeners.length;
        found = false;

        for (var i = 0; i < len; i++) {
            if (eventListeners[i].type === jdata.event &&
                eventListeners[i].listener.node === elementNode &&
                eventListeners[i].listener.service === jdata.service) {
                    listener = eventListeners[i].listener;
                    eventListeners.splice(i, 1);
                    found = true;
                    break;
            }
        }
        if (!found) {
            replyError(ELEMENT_NODE, ADD_SERVICE, 'Service does not exist');
            return;
        }
        elementNode.removeEventListener(jdata.event, listener, false);
        response = {
            'format'    : MessageFormat.REPLY,
            'type'      : NodeType.ELEMENT_NODE,
            'action'    : Action.DROP_SERVICE,
            'status'    : Status.REQUEST_COMPLETE,
            'deviceID'  : jdata.deviceID,
            'elementID' : elementNode.getAttribute('id'),
            'event'     : jdata.event,
            'service'   : jdata.service
        };
        socket.write(JSON.stringify(response) + '\0');
    }

    function locateService(jdata, elementNode) {
        var evt = new DocumentEvent().createEvent(DocumentEvent.SEARCH_EVENT);
        evt.initSearchEvent(SearchEvent.SERVICE_REQUEST, true, false, jdata.service, serviceLocated);
        elementNode.dispatchEvent(evt);
    }

    // Temporal search methods
    function temporalRequest(jdata) {
        var response;
        var callback = function(err, message) {
            if (err) {
                console.log(err);
                replyError(jdata.type, jdata.action, err);
                return;
            } else{
                console.log(message);
                replyMessage(jdata.type, jdata.action, message);
                return;
            };
        };
        switch (jdata.action) {
            case Action.SET_TEMPORAL_TIME : serverPOM.setTemporalTime(jdata.timestamp, callback);         break;
            default                       : replyError(jdata.type, jdata.action, 'Invalid node type');    break;
        }
    }

// Helper Functions
    function getParentDevice(node) {
        var temp = node.parentNode;

        while (temp !== null && temp.nodeName !== 'device')
            temp = temp.parentNode;
        return temp;
    }

    function purgeEventListeners() {
        var evtl,
            len = eventListeners.length;

        for (var i = 0; i < len; i++) {
            evtl = eventListeners[i];
            // POM ACTION
            evtl.listener.node.removeEventListener(evtl.type, evtl.listener, evtl.useCapture);
        }
    }

    function replyError(type, action, message) {
        var response = {
            'format'    : MessageFormat.REPLY,
            'type'      : type,
            'action'    : action,
            'status'    : Status.REQUEST_ERROR,
            'message'   : message
        };
        socket.write(JSON.stringify(response) + '\0');
    }

    function replyMessage(type, action, message) {
        var response = {
            'format'    : MessageFormat.REPLY,
            'type'      : type,
            'action'    : action,
            'status'    : Status.REQUEST_COMPLETE,
            'message'   : message
        };
        socket.write(JSON.stringify(response) + '\0');
    }

    function notifyClient(evt) {
        switch (evt.type) {
            case MutationEvent.SUBTREE_MODIFIED             : subtreeModified(evt);     break;
            case MutationEvent.ELEMENT_INSERTED             : elementInserted(evt);     break;
            case MutationEvent.ELEMENT_REMOVED              : elementRemoved(evt);      break;
            case MutationEvent.ATTR_MODIFIED                : attrModified(evt);        break;
            case MutationEvent.CHARACTER_DATA_MODIFIED      : charDataModified(evt);    break;
            case RegistrationEvent.DEVICE_REGISTERED        : deviceRegistered(evt);    break;
            case RegistrationEvent.DEVICE_UNREGISTERED      : deviceRegistered(evt);    break;
            default                                         :                           break;
        }
    }

    function subtreeModified(evt) {
        // TODO
    }

    function elementInserted(evt) {
        var deviceNode = evt.relatedNode.nodeName === 'device' ? evt.relatedNode : getParentDevice(evt.relatedNode),
            textNode = getTextNode(evt.target),
            notification;

        notification = {
            'format'    : MessageFormat.NOTIFICATION,
            'event'     : MutationEvent.ELEMENT_INSERTED,
            'deviceID'  : deviceNode.getAttribute('id'),
            'parentID'  : evt.relatedNode.getAttribute('id'),
            'tag'       : evt.target.nodeName,
            'elementID' : evt.target.getAttribute('id'),
            'value'     : textNode.nodeValue
        };
        socket.write(JSON.stringify(notification) + '\0');
    }

    function elementRemoved(evt) {
        var deviceNode = evt.relatedNode.nodeName === 'device' ? evt.relatedNode : getParentDevice(evt.relatedNode),
            len = eventListeners.length,
            notification;

        for (var i = 0; i < len; i++) {
            if (eventListeners[i].listener.node === evt.target)
                eventListeners.splice(i, 1);
        }
        notification = {
            'format'    : MessageFormat.NOTIFICATION,
            'event'     : MutationEvent.ELEMENT_REMOVED,
            'deviceID'  : deviceNode.getAttribute('id'),
            'parentID'  : evt.relatedNode.getAttribute('id'),
            'tag'       : evt.target.nodeName,
            'elementID' : evt.target.getAttribute('id')
        };
        socket.write(JSON.stringify(notification) + '\0');
    }

    function attrModified (evt) {
        var deviceNode = evt.relatedNode.nodeName === 'device' ? evt.relatedNode : getParentDevice(evt.relatedNode),
            prevValue = evt.prevValue ? evt.prevValue : 'null',
            notification;

        notification = {
            'format'    : MessageFormat.NOTIFICATION,
            'event'     : MutationEvent.ATTR_MODIFIED,
            'deviceID'  : deviceNode.getAttribute('id'),
            'elementID' : evt.relatedNode.getAttribute('id'),
            'attr'      : evt.attrName,
            'change'    : evt.attrChange,
            'prevValue' : prevValue,
            'newValue'  : evt.newValue
        };
        socket.write(JSON.stringify(notification) + '\0');
    }

    function charDataModified(evt) {
        var prevValue = evt.prevValue ? evt.prevValue : 'null',
            notification,

        notification = {
            'format'    : MessageFormat.NOTIFICATION,
            'event'     : MutationEvent.CHARACTER_DATA_MODIFIED,
            'deviceID'  : getParentDevice(evt.relatedNode).getAttribute('id'),
            'tag'       : evt.relatedNode.parentNode.nodeName,
            'elementID' : evt.relatedNode.parentNode.getAttribute('id'),
            'prevValue' : prevValue,
            'newValue'  : evt.newValue
        };
        socket.write(JSON.stringify(notification) + '\0');
    }

    function deviceRegistered(evt) {
        var notification = {
            'format'    : MessageFormat.NOTIFICATION,
            'event'     : evt.type,
            'deviceID'  : evt.deviceID,
            'deviceType': evt.deviceType,
            'location'  : evt.deviceLoc
        };
        socket.write(JSON.stringify(notification) + '\0');
    }

    function serviceRequest(evt, service, ctrlID) {
        var info = {
                'service'  : service,
                'deviceID' : clientID,
                'controlID': ctrlID,
                'location' : space.getAttribute('id')
            };
        evt.callback(evt, info);
        evt.stopPropagation();
    }

    function serviceLocated(evt, info) {
        var notification = {
            'format'    : MessageFormat.NOTIFICATION,
            'event'     : SearchEvent.SERVICE_LOCATED,
            'service'   : info.service,
            'deviceID'  : info.deviceID,
            'controlID' : info.controlID,
            'location'  : info.location,
        };
        socket.write(JSON.stringify(notification) + '\0');
    }
});
