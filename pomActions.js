// clientActions: 	elementRequest			attrRequest
var REGISTER 		registerClient:
var GET_VALUE	 	getElementValue: 		getAttrValue:
var SET_VALUE	 	setElementValue: 		setAttrValue:
var INSERT_NODE  	insertElementNode: 		insertAttrNode:
var REMOVE_NODE		removeElementNode: 		removeAttrNode:
var SUBSCRIBE		subscribeEvent:
var UNSUBSCRIBE		unsubscribeEvent:
var ADD_SERVICE		addService:
var DROP_SERVICE	dropService:
var LOCATE_SERVICE  locateService:


// elementRequest							POM ACTION
registerClient(clientPOM);					space.appendChild(device);
unregisterClient();							space.removeChild(device);
insertElementNode(jdata, deviceNode);		elementNode = serverPOM.createElement(jdata.tag);
											elementNode.setAttribute("id", jdata.elementID);
											parentNode.appendChild(elementNode);
											textNode = serverPOM.createTextNode(jdata.value);
											elementNode.appendChild(textNode);
getElementValue(jdata, elementNode);
setElementValue(jdata, elementNode);		textNode.replaceData(start, oldValue.length, jdata.value);
removeElementNode(jdata, elementNode);		parentNode.removeChild(elementNode);
											parentNode.appendChild(childNodes[i]);//i times

subscribeEvent(jdata, elementNode);			elementNode.addEventListener(jdata.event, listener, capture);
unsubscribeEvent(jdata, elementNode);		elementNode.removeEventListener(jdata.event, listener, capture);
addService(jdata, elementNode);				elementNode.addEventListener(jdata.event, listener, capture);
dropService(jdata, elementNode);			elementNode.removeEventListener(jdata.event, listener, capture);
locateService(jdata, elementNode);

// attrRequest									POM ACTION
insertAttrNode(jdata, elementNode);				elementNode.setAttribute(jdata.attr, jdata.value);
getAttrValue(jdata, attrNode);
setAttrValue(jdata, elementNode, attrNode);		elementNode.setAttribute(jdata.attr, jdata.value);
removeAttrNode(jdata, elementNode, attrNode);	elementNode.removeAttribute(jdata.attr);

// others									POM ACTION
purgeEventListeners();						evtl.listener.node.removeEventListener(evtl.type, evtl.listener, evtl.useCapture);//len times


// all POM Actions 										OBJECT
.appendChild(device);									Node Element CharacterData
.removeChild(device);									Node
.createElement(jdata.tag);								Document
.createTextNode(jdata.value);							Document
.setAttribute("id", jdata.elementID);					Element
.removeAttribute(jdata.attr);							Element
.replaceData(start, oldValue.length, jdata.value);		CharacterData
.addEventListener(jdata.event, listener, capture);		Node
.removeEventListener(jdata.event, listener, capture);	Node

// info to save in db
POMAction:			ActionNode: 	ActionInfo:						timestamp:	clientInfo:(clientIP, clientID)
appendChild			nodeID			deviceString
removeChild			nodeID			childID
createElement		nodeID			tag
createTextNode		nodeID			textString
setAttribute		nodeID			{attrName, valueString}
removeAttribute		nodeID			attrName
replaceData			nodeID			{start, length, value}
addEventListener	nodeID			{event, listener, capture}
removeEventListener nodeID			{event, listener, capture}

nodeID could be replaced with deviceID + nodeID

function logToDB(actionName, deviceID, nodeID, actionInfo){};

// think the element node operation has to have a node id, how to remove that constrain in temporal search start
