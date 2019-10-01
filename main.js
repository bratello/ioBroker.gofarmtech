/* jshint -W097 */// jshint strict:false
/*jslint node: true */
'use strict';

// you have to require the utils module and call adapter function
const utils =    require(__dirname + '/lib/utils'); // Get common adapter utils

// you have to call the adapter function and pass a options object
// name has to be set and has to be equal to adapters folder name and main file name excluding extension
// adapter will be restarted automatically every time as the configuration changed, e.g system.adapter.gofarmtech.0
const adapter = new utils.Adapter('gofarmtech');

let server = null;

// is called when adapter shuts down - callback has to be called under any circumstances!
adapter.on('unload', function (callback) {
    try {
        adapter.log.info('cleaned everything up...');
        if(server) {
            server.destroy();
            server = null;
        }
        callback();
    } catch (e) {
        callback();
    }
});



// Some message was sent to adapter instance over message box. Used by email, pushover, text2speech, ...
/*adapter.on('message', function (obj) {
    if (typeof obj === 'object' && obj.message) {
        if (obj.command === 'send') {
            // e.g. send email or pushover or whatever
            console.log('send command');

            // Send response in callback if required
            if (obj.callback) adapter.sendTo(obj.from, obj.command, 'Message received', obj.callback);
        }
    }
});*/

// is called when databases are connected and adapter received configuration.
adapter.on('ready', function () {
    main();
});

function main() {
    adapter.log.info('adpater start: ' + adapter.namespace);

    const Server = require(__dirname + '/lib/server');
    server = new Server(adapter);
    server.initialize();
    server.on('ackTimeout', (id, state, alarm) => {
        server.deviceNameFromId(id).then((name) => {
            server.info('ackTimeout Event', id, name, state, alarm);
        });
    });
    server.on('criticalMinValue', (id, state, alarm) => {
        server.deviceNameFromId(id).then((name) => {
            server.info('criticalMinValue Event', id, name, state, alarm);
        });
    });
    server.on('criticalMaxValue', (id, state, alarm) => {
        server.deviceNameFromId(id).then((name) => {
            server.info('criticalMaxValue Event', id, name, state, alarm);
        });
    });
}
