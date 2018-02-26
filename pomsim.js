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

// Attribute Change Types
var AttrChangeType = {};
var ADDITION                = AttrChangeType.ADDITION                   = 1;
var MODIFICATION            = AttrChangeType.MODIFICATION               = 2;
var REMOVAL                 = AttrChangeType.REMOVAL                    = 3;

var fs = require('fs'),
    jStat = require('jstat').jStat,
    mathjs = require('mathjs'),
    moment = require('moment'),
    mkdirp = require('mkdirp'),
    DOMParser = require('xmldom').DOMParser,
    DocumentEvent = require('xmldom').DocumentEvent,
    rs = fs.createReadStream('config.json'),
    configData = '';

rs.on('data', function(data) {
    configData = configData.concat(data);
});

rs.on('end', function() {
    sim = new Simulation();
    sim.initSimulation(configData);
    sim.generatePOM();
    sim.run();
});

function Simulation() {};

Simulation.prototype = {
    POM             : null,
    root            : null,
    config          : null,
    dist            : null,
    runtime         : null,
    deviceNodes     : null,
    spaceNodes      : null,
    eventData       : null,
    deviceData      : null,
    deviceRegistrar : 0,
    spaceMutator    : 0,
    totalStationary : 0,
    totalMobile     : 0,
    totalSpaces     : 0,
    avgSubSpaces    : 0,
    totalListeners  : 0,
    triggered       : 0,
    start           : 0,
    finish          : 0,
    temporalData    : null,

    initSimulation: function(configData) {
        var parser = new DOMParser(),
            config = JSON.parse(configData);

        this.POM = parser.parseFromString('<?xml version="1.0"?>', 'text/xml');
        this.POM.startLogging();
        this.dist = {
            stationary: this.getSampleGenerator(config.stationary),
            space: this.getSampleGenerator(config.space),
            listNum: this.getSampleGenerator(config.listNum),
            listPos: this.getSampleGenerator(config.listPos),
            eventInt: this.getSampleGenerator(config.eventInt),
            lifespan: this.getSampleGenerator(config.lifespan),
            writeProb: this.getSampleGenerator(config.writeProb)
        };
        this.deviceNodes = { stationary: [], mobile: [] },
        this.spaceNodes = [];
        this.eventData = [];
        this.deviceData = [];
        this.config = config;
    },

    getSampleGenerator: function(model) {
        var generator;

        switch (model.dist) {
            case 'normal' :
                generator = function() {
                    return jStat.normal.sample(model.mean, model.std);
                };
                break;
            case 'exponential' :
                generator = function() {
                    return jStat.exponential.sample(model.rate);
                };
                break;
            case 'beta' :
                generator = function() {
                    return jStat.beta.sample(model.alpha, model.beta);
                };
                break;
            case 'gamma' :
                generator = function() {
                    return jStat.gamma.sample(model.shape, model.scale);
                };
                break;
            case 'chisquare' :
                generator = function() {
                  return jStat.chisquare.sample(model.dof);
                };
                break;
            default :
                generator = function() { return 0; };
                break;
        }
        return generator;
    },

    generatePOM: function() {
        var config = this.config,
            grid = config.grid,
            xMax = grid.xScale * grid.range,
            yMax = grid.yScale * grid.range,
            zMax = grid.zScale * grid.range,
            stationary = this.deviceNodes.stationary,
            nodeQueue = [],
            spaceCount = 0, subSpaceCount = 0,
            next, currentNode, newNode, space, subspaces,
            numDevs, numSpaces;

        // create root node of serverPOM with space property
        this.root = this.POM.createElement('device');
        this.root.setAttribute("id", guid());
        this.root.device = new Device(new Point(0, 0, 0));
        this.POM.appendChild(this.root);

        newNode = this.POM.createElement('space');
        newNode.setAttribute("id", guid());
        newNode.space = new Space(0, xMax, 0, yMax, 0, zMax);
        this.root.appendChild(newNode);
        nodeQueue.push(newNode);

        while (this.totalStationary < config.stationary.max &&
               this.totalSpaces < config.space.max) {

            if (nodeQueue.length) {
                next = Math.floor(Math.random() * nodeQueue.length);
                currentNode = nodeQueue[next];
                nodeQueue.splice(next, 1);
            }
            if (currentNode.nodeName === 'space') {
                space = currentNode.space;
                numDevs = mathjs.round(this.dist.stationary(), 0);

                for (var i = 0; i < numDevs; i++) {
                    newNode = this.POM.createElement('device');
                    newNode.setAttribute("id", guid());
                    newNode.device = new Device(space.randomPoint());
                    currentNode.appendChild(newNode);
                    stationary.push(newNode);
                    this.createListeners(newNode);
                    nodeQueue.push(newNode);
                    this.totalStationary++;

                    if (this.totalStationary === config.stationary.max) break;
                    else continue;
                }
            }
            else space = currentNode.parentNode.space;

            numSpaces = Math.floor(this.dist.space());
            subspaces = numSpaces ? space.partition(numSpaces) : null;
            if (subspaces) {
                spaceCount += 1;
                subSpaceCount += numSpaces;
            };
            for (var i = 0; i < numSpaces; i++) {
                newNode = this.POM.createElement('space');
                newNode.setAttribute("id", guid());
                newNode.space = subspaces[i];
                currentNode.appendChild(newNode);
                nodeQueue.push(newNode);
                this.spaceNodes.push(newNode);
                this.totalSpaces++;

                if (this.totalSpaces === config.space.max) break;
                else continue;
            }
        }
        this.avgSubSpaces = subSpaceCount / spaceCount;
    },

    createListeners: function(node) {
        var env = this,
            numListeners = Math.floor(env.dist.listNum()),
            maxListeners = env.config.listNum.max,
            parentSpaces = getParentSpaces(node),
            len = parentSpaces.length,
            index,
            space,
            listener,
            evt;

        listener = {
            'node': node,
            'handleEvent': function(evt) {
                evt.trace.stamp(node);
                env.triggered++;
            },
        };
        evt = Math.floor(Math.random() * 6) + 1;

        for (var i = 0; i < numListeners && i < maxListeners; i++) {
            index = Math.floor(this.dist.listPos());
            space = parentSpaces[(index < len) ? index : (len - 1)];
            space.addEventListener(evt, listener, true);
            this.totalListeners++;
            evt = (evt == 6) ? 1 : (evt + 1) % 7;
        }
    },

    run: function() {
        var stationary = this.deviceNodes.stationary,
            len = stationary.length,
            device;

        this.start = new Date().getTime();
        //setTimeout(this.exit, this.config.runtime * 1000, this);
        setTimeout(this.startTemporalTime, this.config.runtime * 1000, this);
        this.deviceRegistrar = setTimeout(
          this.registerDev,
          this.dist.eventInt() * 1000 / this.config.eventFiringRate,
          this
        );
        this.spaceMutator = setTimeout(
            this._spaceMutation,
            this.dist.eventInt() * 1000 / this.config.eventFiringRate,
            this
        );

        for (var i = 0; i < len; i++) {
            device = stationary[i].device;
            device.setEventTimer(setTimeout(
                this.generateEvent,
                this.dist.eventInt() * 1000 / this.config.eventFiringRate,
                this, stationary[i]
            ));
        }
    },

    exit: function(env) {
        var config = env.config,
            range = config.grid.range,
            dir = __dirname + '/TEST DATA/' + moment().format('YYYY-MM-DD HH:mm:ss'),
            data = '',
            time = [], dist = [],
            len1 = 0, len2 = 0, len3 = 0, lenmob = 0,
            sum1 = 0, sum2 = 0, sum3 = 0,
            wsum = 0, runsum = 0,
            trace, source, location, notified,
            results, display;

        env.finish = new Date().getTime();
        env.clearTimers();

        console.log('\nConfiguration: ');
        console.log('------------------------------------------------');
        console.log(JSON.stringify(env.config, undefined, 2).replace(/[\"{},]/g,''));
        console.log('\nGetting results... ');

        len1 = env.eventData.length;
        len3 = env.deviceData.length;

        for (var i = 0; i < len1; i++) {
            trace = env.eventData[i];
            notified = trace.notified;
            source = trace.source;
            location = source.device.location;
            len2 = notified.length;
            sum1 = 0;
            sum2 = 0;

            for (var j = 0; j < len2; j++) {
                  sum1 += location.getDistance(notified[j].device.location);
                  sum2 += (notified[j].time - trace.start);
            }
            dist.push(sum1 / len2);
            time.push(sum2 / len2);
        }
        sum1 = 0;
        sum2 = 0;

        for (var i = 0; i < len1; i++) {
            trace = env.eventData[i];
            sum1 += dist[i];
            sum2 += time[i];
            sum3 += (trace.finish - trace.start);
        }

        for (var i = 0; i < len3; i++) {
            trace = env.deviceData[i];
            if (trace.type === "mobile") {
                wsum += trace.wCount;
                runsum += trace.runtime;
                lenmob += 1;
            }
        };
        runsum = runsum /1000;


        results = {
            "runtime"   : env.finish - env.start,
            "stationary": env.totalStationary,
            "mobile"    : env.totalMobile,
            "spaces"    : env.totalSpaces,
            "avgSubSpa" : env.avgSubSpaces,
            "dispatched": env.eventData.length,
            "triggered" : env.triggered,
            "lpd"       : mathjs.round(env.totalListeners / env.totalStationary, 1),
            "tpe"       : mathjs.round(env.triggered / len1, 0),
            "ept"       : mathjs.round(sum3 / len1, 2),
            "ntpud"     : mathjs.round(sum2 / sum1, 5),
            "avgwrt"    : wsum/lenmob,
            "avgmls"    : runsum/lenmob,
            "wrtpls"    : mathjs.round(wsum / runsum, 5),
            "tempoTime" : env.temporalData.duration,
            "tempoLogs" : env.temporalData.logCount
        }
        display =
            mathjs.round(results.runtime / 1000, 2) + '\tRuntime (actual)(sec)\n' +
            mathjs.round(results.stationary, 2)     + '\t# stationary devices\n' +
            mathjs.round(results.mobile, 2)         + '\t# mobile devices\n' +
            mathjs.round(results.spaces, 2)         + '\t# spaces\n' +
            mathjs.round(results.avgSubSpa, 2)      + '\t# average subspaces per space\n' +
            mathjs.round(results.dispatched, 2)     + '\t# events dispatched\n' +
            mathjs.round(results.triggered, 2)      + '\t# handlers triggered\n' +
            mathjs.round(results.lpd, 2)            + '\tAverage # listeners per device\n' +
            mathjs.round(results.avgwrt, 2)         + '\tAverage # writes per mobile devices\n' +
            mathjs.round(results.avgmls, 2)         + '\tAverage lifespan for mobile devices\n' +
            mathjs.round(results.wrtpls, 2)         + '\tAverage # write rate for mobile devices\n' +
            mathjs.round(results.tpe, 2)            + '\tAverage # handlers triggered per event\n' +
            mathjs.round(results.ept, 2)            + '\tAverage event propagation time (msec)\n' +
            mathjs.round(results.ntpud, 2)          + '\tAverage notification time per unit distance (msec)\n' +
            mathjs.round(results.tempoTime, 2)      + '\tTime to construct Temporal Instance (msec)\n' +
            mathjs.round(results.tempoLogs, 2)      + '\tNumber of logs replayed during construction' ;

        console.log('------------------------------------------------\n');
        console.log(display + '\n');

        mkdirp(dir, function(err) {
            if (err) return console.log('Error creating directory\n' + err);

            fs.writeFile(dir + '/config.json', configData, function(err) {
                if (err) return console.log('Error writing file\n' + err);
            });
            fs.writeFile(dir + '/results.json', JSON.stringify(results, undefined, 2), function(err) {
                if (err) return console.log('Error writing file\n' + err);
            });
            fs.writeFile(dir + '/results.txt', display, function(err) {
                if (err) return console.log('Error writing file\n' + err);
            });

            for (var i = 0; i < len1; i++) {
                data = data + mathjs.round(dist[i],1) + '\t' + mathjs.round(time[i],3);
                if (i < len1 - 1) data = data + '\n';
            }
            fs.writeFile(dir + '/data.txt', data, function(err) {
                if (err) return console.log('Error writing file\n' + err);
            });
        });
    },

    clearTimers: function() {
        var stationary = this.deviceNodes.stationary,
            mobile = this.deviceNodes.mobile,
            deviceData = this.deviceData,
            device,
            runtime,
            len;

        clearTimeout(this.deviceRegistrar);
        clearTimeout(this.spaceMutator);
        len = stationary.length;

        for (var i = 0; i < len; i++) {
            device = stationary[i].device;
            device.clearEventTimer();
            runtime = new Date().getTime() - device.start;
            deviceData.push({
                "type": "stationary",
                "runtime": runtime,
            });
        }
        len = mobile.length;

        for (var i = 0; i < len; i++) {
            device = mobile[i].device;
            device.clearLifespan();
            device.clearEventTimer();
            runtime = new Date().getTime() - device.start;
            deviceData.push({
                "type": "mobile",
                "runtime": runtime,
                "wCount" : device.writeCount
            });
        }
    },

    generateEvent: function(env, devNode) {
        var isWriteEvent,
            device = devNode.device;
            random = Math.floor(Math.random() * 10);
            isWriteEvent = device.writeProb > random;
        // console.log("genevent "+isWriteEvent+" writeProb "+ device.writeProb +" random "+ random);
        if (isWriteEvent) {
            var eventSeq = Math.floor(Math.random() * 2);
            switch (eventSeq) {
                case 0  : env.addElement(env, devNode); break;
                case 1  : env.addAttr(env, devNode);    break;
                default :
            }
        } else {
            device.setEventTimer(setTimeout(
                env.generateEvent,
                env.dist.eventInt() * 1000 / env.config.eventFiringRate,
                env,
                devNode
            ));
        };
    },

    addElement: function(env, devNode) {
        var device = devNode.device,
            elemNode,
            textNode;

        elemNode = env.POM.createElement('state');
        elemNode.setAttribute("id", guid());
        textNode = env.POM.createTextNode('on');
        elemNode.appendChild(textNode);
        devNode.appendChild(elemNode);
        device.increaseWriteCount();
        evt = new DocumentEvent().createEvent(DocumentEvent.MUTATION_EVENT);
        evt.initMutationEvent(MutationEvent.ELEMENT_INSERTED, true, false, devNode);
        evt.trace = new EventTrace(devNode);
        evt.trace.run();

        elemNode.dispatchEvent(evt);
        evt.trace.end();
        env.eventData.push(evt.trace);
        device.setEventTimer(setTimeout(env.updateElement, env.dist.eventInt() * 1000 / env.config.eventFiringRate, env, devNode, elemNode));
    },

    updateElement: function(env, devNode, elemNode) {
        var device = devNode.device,
            textNode = getTextNode(elemNode),
            oldValue,
            start,
            evt;

        oldValue = textNode.nodeValue.trim(),
        start = textNode.nodeValue.search(oldValue),
        textNode.replaceData(start, oldValue.length, 'off');
        device.increaseWriteCount();

        evt = new DocumentEvent().createEvent(DocumentEvent.MUTATION_EVENT);
        evt.initMutationEvent(MutationEvent.CHARACTER_DATA_MODIFIED, true, false, textNode, oldValue, 'off');
        evt.trace = new EventTrace(devNode);
        evt.trace.run();

        textNode.dispatchEvent(evt);
        evt.trace.end();
        env.eventData.push(evt.trace);
        device.setEventTimer(setTimeout(env.removeElement, env.dist.eventInt() * 1000 / env.config.eventFiringRate, env, devNode, elemNode));
    },

    removeElement: function(env, devNode, elemNode) {
        var device = devNode.device,
            evt;

        evt = new DocumentEvent().createEvent(DocumentEvent.MUTATION_EVENT);
        evt.initMutationEvent(MutationEvent.ELEMENT_REMOVED, true, false, devNode);
        evt.trace = new EventTrace(devNode);
        evt.trace.run();

        elemNode.dispatchEvent(evt);
        evt.trace.end();
        env.eventData.push(evt.trace);
        devNode.removeChild(elemNode);
        device.increaseWriteCount();
        device.setEventTimer(setTimeout(env.generateEvent, env.dist.eventInt() * 1000 / env.config.eventFiringRate, env, devNode));
    },

    addAttr: function(env, devNode) {
        var device = devNode.device;

        devNode.setAttribute('type', 'stationary');
        device.increaseWriteCount();
        evt = new DocumentEvent().createEvent(DocumentEvent.MUTATION_EVENT);
        evt.initMutationEvent(MutationEvent.ATTR_MODIFIED, true, false, devNode, null, 'stationary', 'type', AttrChangeType.ADDITION);
        evt.trace = new EventTrace(devNode);
        evt.trace.run();

        devNode.dispatchEvent(evt);
        evt.trace.end();
        env.eventData.push(evt.trace);
        device.setEventTimer(setTimeout(env.updateAttr, env.dist.eventInt() * 1000 / env.config.eventFiringRate, env, devNode));
    },

    updateAttr: function(env, devNode) {
        var device = devNode.device;
        device.increaseWriteCount();
        devNode.setAttribute('type', 'mobile');
        evt = new DocumentEvent().createEvent(DocumentEvent.MUTATION_EVENT);
        evt.initMutationEvent(MutationEvent.ATTR_MODIFIED, true, false, devNode, 'stationary', 'mobile', 'type', AttrChangeType.MODIFICATION);
        evt.trace = new EventTrace(devNode);
        evt.trace.run();

        devNode.dispatchEvent(evt);
        evt.trace.end();
        env.eventData.push(evt.trace);
        device.setEventTimer(setTimeout(env.removeAttr, env.dist.eventInt() * 1000 / env.config.eventFiringRate, env, devNode));
    },

    removeAttr: function(env, devNode) {
        var device = devNode.device;
        device.increaseWriteCount();
        devNode.removeAttribute('type');
        evt = new DocumentEvent().createEvent(DocumentEvent.MUTATION_EVENT);
        evt.initMutationEvent(MutationEvent.ATTR_MODIFIED, true, false, devNode, 'mobile', null, 'type', AttrChangeType.REMOVAL);
        evt.trace = new EventTrace(devNode);
        evt.trace.run();

        devNode.dispatchEvent(evt);
        evt.trace.end();
        env.eventData.push(evt.trace);
        device.setEventTimer(setTimeout(env.generateEvent, env.dist.eventInt() * 1000 / env.config.eventFiringRate, env, devNode));
    },

    registerDev: function(env) {
        var devNode = env.POM.createElement('device'),
            spaceNodes = env.spaceNodes,
            mobile = env.deviceNodes.mobile,
            len = spaceNodes.length,
            parentNode = spaceNodes[Math.floor(Math.random() * len)],
            device = new Device(parentNode.space.randomPoint());

        devNode.setAttribute("id", guid());
        devNode.device = device;
        parentNode.appendChild(devNode);
        mobile.push(devNode);
        env.totalMobile++;

        evt = new DocumentEvent().createEvent(DocumentEvent.REGISTRATION_EVENT);
        evt.initRegistrationEvent(
            RegistrationEvent.DEVICE_REGISTERED,
            true,
            false
        );
        evt.trace = new EventTrace(devNode);
        evt.trace.run();

        devNode.dispatchEvent(evt);
        evt.trace.end();
        env.eventData.push(evt.trace);

        device.start = new Date().getTime();
        device.setEventTimer(setTimeout(
            env.generateEvent,
            env.dist.eventInt() * 1000 / env.config.eventFiringRate,
            env,
            devNode
        ));
        device.setLifespan(setTimeout(
            env.unregisterDev,
            env.dist.lifespan() * 1000,
            env,
            devNode
        ));
        device.setWriteProb(env.dist.writeProb());

        env.deviceRegistrar = setTimeout(
            env.registerDev,
            env.dist.eventInt() * 1000 / env.config.eventFiringRate,
            env
        );
    },

    unregisterDev: function(env, devNode) {
        var mobile = env.deviceNodes.mobile,
            len = mobile.length,
            parentNode = devNode.parentNode,
            deviceID = devNode.getAttribute('id'),
            device = devNode.device,
            evt;

        device.clearEventTimer();
        runtime = new Date().getTime() - device.start;
        env.deviceData.push({
            "type": "mobile",
            "runtime": runtime,
            "wCount" : device.writeCount
        });
        // if (device.writeCount>0) {console.log(device.writeCount);};
        parentNode.removeChild(devNode);

        for (var i = 0; i < len; i++) {
            if (mobile[i].getAttribute('id') === deviceID)
                break;
        }
        mobile.splice(i, 1);

        evt = new DocumentEvent().createEvent(DocumentEvent.REGISTRATION_EVENT);
        evt.initRegistrationEvent(
            RegistrationEvent.DEVICE_UNREGISTERED,
            true,
            false
        );
        evt.trace = new EventTrace(devNode);
        evt.trace.run();

        parentNode.dispatchEvent(evt);
        evt.trace.end();
        env.eventData.push(evt.trace);
    },

    _spaceMutation: function(env) {
        var mutation = Math.floor(Math.random() * 2),
            numSpaces = env.spaceNodes.length,
            node = env.spaceNodes[Math.floor(Math.random() * numSpaces)],
            spaceNodes;

        switch (mutation) {
            case 0:
                env._divideSpaceNode(env, node);
                break;
            case 1:
                spaceNodes = getChildrenByTagName(node.parentNode, 'space');
                env._mergeSpaceNodes(env, spaceNodes);
                break;
            default:
        }
        env.spaceMutator = setTimeout(
            env._spaceMutation,
            env.dist.eventInt() * 1000 / env.config.eventFiringRate,
            env
        );
    },

    _divideSpaceNode: function(env, node) {
        var sample = Math.floor(env.dist.space()),
            numNodes = (sample < 2) ? 2 : sample,
            parent = node.parentNode,
            children = node.childNodes,
            numChildren = children ? children.length : 0,
            listeners = node.eventListeners,
            numListeners = listeners ? listeners.length : 0,
            numSpaces = env.spaceNodes.length,
            subspaces = node.space.partition(numNodes),
            id = node.getAttribute('id'),
            newNodes = [],
            current,
            evt;

        for (var i = 0; i < numNodes; i++) {
            current = env.POM.createElement('space');
            current.setAttribute('id', guid());
            current.eventListeners = [];
            current.space = subspaces[i];
            newNodes.push(current);
        }
        for (var i = 0; i < numChildren; i++) {
            current = newNodes[i % numNodes];

            if (children[0].nodeName === 'device')
                children[0].device.location = current.space.randomPoint();

            current.appendChild(children[0]);
        }
        for(var i = 0; i < numListeners; i++) {
            current = newNodes[i % numNodes];
            current.eventListeners.push(listeners.shift());
        }
        evt = new DocumentEvent().createEvent(DocumentEvent.MUTATION_EVENT);
        evt.initMutationEvent(
            MutationEvent.ELEMENT_REMOVED,
            true,
            false,
            parent
        );
        evt.trace = new EventTrace(env.root);
        evt.trace.run();
        node.dispatchEvent(evt);
        evt.trace.end();
        env.eventData.push(evt.trace);
        parent.removeChild(node);

        for (var i = 0; i < numSpaces; i++) {
            if (env.spaceNodes[i].getAttribute('id') === id)
                break;
        }
        env.spaceNodes.splice(i, 1);
        env.totalSpaces--;

        for (var i = 0; i < numNodes; i++) {

            parent.appendChild(newNodes[i]);
            env.spaceNodes.push(newNodes[i]);
            env.totalSpaces++;

            evt = new DocumentEvent().createEvent(DocumentEvent.MUTATION_EVENT);
            evt.initMutationEvent(
                MutationEvent.ELEMENT_INSERTED,
                true,
                false,
                parent
            );
            evt.trace = new EventTrace(env.root);
            evt.trace.run();
            newNodes[i].dispatchEvent(evt);
            evt.trace.end();
            env.eventData.push(evt.trace);
        }
    },

    _mergeSpaceNodes: function(env, nodes) {
        var newNode, parent, current, id, children, listeners, evt,
            numNodes, numChildren, numListeners, numSpaces;

        if (nodes.constructor !== Array || nodes.length < 2)
            return;

        numNodes = nodes.length;
        parent = nodes[0].parentNode;
        newNode = env.POM.createElement('space');
        newNode.setAttribute('id', guid());
        newNode.eventListeners = [];
        newNode.space = new Space(0,0,0,0,0,0);

        for (var i = 0; i < numNodes; i++) {
            current = nodes[i];
            newNode.space = newNode.space.combine(current.space);
            children = current.childNodes;
            numChildren = children ? children.length : 0;

            while (numChildren--)
                newNode.appendChild(children[0]);

            listeners = current.eventListeners;
            numListeners = listeners ? listeners.length : 0;

            while (numListeners--)
                newNode.eventListeners.push(listeners.shift());

            evt = new DocumentEvent().createEvent(DocumentEvent.MUTATION_EVENT);
            evt.initMutationEvent(
                MutationEvent.ELEMENT_REMOVED,
                true,
                false,
                parent
            );
            evt.trace = new EventTrace(env.root);
            evt.trace.run();
            current.dispatchEvent(evt);
            evt.trace.end();
            env.eventData.push(evt.trace);
            parent.removeChild(current);

            numSpaces = env.spaceNodes.length;
            id = current.getAttribute('id');

            for (var j = 0; j < numSpaces; j++) {
                if (env.spaceNodes[j].getAttribute('id') === id)
                    break;
            }
            env.spaceNodes.splice(j, 1);
            env.totalSpaces--;
        }
        parent.appendChild(newNode);
        env.spaceNodes.push(newNode);
        env.totalSpaces++;

        evt = new DocumentEvent().createEvent(DocumentEvent.MUTATION_EVENT);
        evt.initMutationEvent(
            MutationEvent.ELEMENT_INSERTED,
            true,
            false,
            parent
        );
        evt.trace = new EventTrace(env.root);
        evt.trace.run();
        newNode.dispatchEvent(evt);
        evt.trace.end();
        env.eventData.push(evt.trace);
    },

    startTemporalTime: function(env) {
        var start   = new Date().getTime(),
            finish  = 0,
            callback = function(err, message, logCount) {
                console.log("done temporal");
                if (err) {
                    env.temporalData = {'duration' : -1};
                    env.exit(env);
                } else{
                    finish = new Date().getTime();
                    env.temporalData = {'duration' : finish - start,
                                        'logCount' : logCount};
                    env.exit(env);
                };
            };
            console.log("temporal start");
        env.POM.setTemporalTime(start, callback);
    }
}

function EventTrace(source) {
    this.source = source;
    this.notified = [];
}

EventTrace.prototype = {
    source   : null,
    notified : null,
    start    : 0,
    finish   : 0,

    run: function() {
        this.start = new Date().getTime();
    },

    end: function() {
        this.finish = new Date().getTime();
    },

    stamp: function(node) {
        this.notified.push({
          'device': node.device,
          'time': new Date().getTime()
        });
    }
}

function Device(loc) {
    this.location = loc;;
}

Device.prototype = {
    location: null,
    lifespan: null,
    eventTimer: null,
    writeCount: 0,
    start: 0,
    writeProb: 0,

    setLifespan: function(id) {
        this.lifespan = id;
    },

    setEventTimer: function(id) {
        this.eventTimer = id;
    },

    clearLifespan: function() {
        clearTimeout(this.lifespan);
    },

    clearEventTimer: function() {
        clearTimeout(this.eventTimer);
    },

    setWriteProb: function(prob) {
        if (prob > 10) {
            this.writeProb = 10;
        }
        else if(prob < 0) {
            this.writeProb = 0;
        }
        else{
            this.writeProb = mathjs.round(prob,0);
        };
    },

    increaseWriteCount: function() {
        this.writeCount += 1;
    }
}

function Space(x1, x2, y1, y2, z1, z2) {
    this.xMin = x1;
    this.xMax = x2;
    this.yMin = y1;
    this.yMax = y2;
    this.zMin = z1 ? z1 : 0;
    this.zMax = z2 ? z2 : 0;
}

Object.defineProperty(Space, "X", { value : 0 });
Object.defineProperty(Space, "Y", { value : 1 });
Object.defineProperty(Space, "Z", { value : 2 });

Space.prototype = {
    xMin : 0,
    xMax : 0,
    yMin : 0,
    yMax : 0,
    zMin : 0,
    zMax : 0,

    partition: function(numSpaces) {
        var x1 = this.xMin, x2 = this.xMax,
            y1 = this.yMin, y2 = this.yMax,
            z1 = this.zMin, z2 = this.zMax,
            partition,
            axis,
            div,
            s1, s2,
            p1, p2;

        if (!numSpaces || numSpaces < 0)
            return;

        if (numSpaces === 1) {
            partition = [];
            partition.push(this);
        }
        else {
            if (!this.zMin && !this.zMax)
                axis = Math.floor(Math.random() * 2);
            else
                axis = Math.floor(Math.random() * 3);

            switch (axis) {
                case Space.X :
                    div = x1 + (x2 - x1) / 2;
                    s1 = new Space(x1, div, y1, y2, z1, z2);
                    s2 = new Space(div, x2, y1, y2, z1, z2);
                    break;
                case Space.Y :
                    div = y1 + (y2 - y1) / 2;
                    s1 = new Space(x1, x2, y1, div, z1, z2);
                    s2 = new Space(x1, x2, div, y2, z1, z2);
                    break;
                case Space.Z :
                    div = z1 + (z2 - z1) / 2;
                    s1 = new Space(x1, x2, y1, y2, z1, div);
                    s2 = new Space(x1, x2, y1, y2, div, z2);
                    break;
                default :
            }
            p1 = s1.partition(Math.floor(numSpaces/2));
            p2 = s2.partition(Math.ceil(numSpaces/2));
            partition = p1.concat(p2);
        }
        return partition;
    },

    combine: function(space) {
        var xMin, xMax, yMin, yMax, zMin, zMax;

        xMin = (space.xMin > this.xMin) ? this.xMin : space.xMin;
        xMax = (space.xMax < this.xMax) ? this.xMax : space.xMax;
        yMin = (space.yMin > this.yMin) ? this.yMin : space.yMin;
        yMax = (space.yMax < this.yMax) ? this.yMax : space.yMax;
        zMin = (space.zMin > this.zMin) ? this.zMin : space.zMin;
        zMax = (space.zMax < this.zMax) ? this.zMax : space.zMax;

        return new Space(xMin, xMax, yMin, yMax, zMin, zMax);
    },

    contains: function(pt) {
        if (pt.x >= this.xMin && pt.x < this.xMax &&
            pt.y >= this.yMin && pt.y < this.yMax &&
            pt.z >= this.zMin && pt.z < this.zMax)
                return true;
        return false;
    },

    randomPoint: function() {
        var x = Math.floor(Math.random() * (this.xMax - this.xMin)) + this.xMin,
            y = Math.floor(Math.random() * (this.yMax - this.yMin)) + this.yMin,
            z = Math.floor(Math.random() * (this.zMax - this.zMin)) + this.zMin;

        return new Point(x,y,z);
    },

    print: function() {
        console.log('x range: ' + this.xMin + ' to ' + this.xMax);
        console.log('y range: ' + this.yMin + ' to ' + this.yMax);
        console.log('z range: ' + this.zMin + ' to ' + this.zMax);
    }
}

function Point(x, y, z) {
    this.x = x;
    this.y = y;
    if (typeof z !== 'undefined')
      this.z = z;
}

Point.prototype = {
    x : 0,
    y : 0,
    z : 0,

    getDistance: function(pt) {
        return Math.sqrt(
            Math.pow(pt.x - this.x, 2) +
            Math.pow(pt.y - this.y, 2) +
            Math.pow(pt.z - this.z, 2)
        );
    },

    print: function() {
        console.log('(' + this.x + ',' + this.y + ',' + this.z + ')');
    }
}

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

    for (i = 0; i < len; i++) {
        if (children[i].nodeType === 3) {
            textNode = children[i];
            break;
        }
    }
    return textNode;
}

function getParentSpaces(node) {
    var spaces;

    if (!node.parentNode)
        spaces = [];
    else
        spaces = getParentSpaces(node.parentNode);

    if (node.nodeName === 'space') spaces.unshift(node);
    return spaces;
}

function getChildrenByTagName(node, tag) {
    var children = node.childNodes,
        numChildren = children.length,
        result = [];

    if (!tag || tag.constructor !== String)
        return;

    for (var i = 0; i < numChildren; i++) {
        if (children[i].nodeName === tag)
            result.push(children[i]);
    }
    return result;
}

function guid() {
  function s4() {
    return Math.floor((1 + Math.random()) * 0x10000)
      .toString(16)
      .substring(1);
  }
  return s4() + s4() + '-' + s4() + '-' + s4() + '-' +
    s4() + '-' + s4() + s4() + s4();
}
