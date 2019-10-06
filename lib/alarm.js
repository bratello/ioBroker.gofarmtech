'use strict';
const request = require('request');

module.exports = function AlarmService(server) {

	function getDeviceName(id, cb) {
		server.deviceNameFromId(id).then(cb);
	}

	let sentAlarms = {};
	function doRequest(id, data) {
		if(id in sentAlarms) {
			return;
		}
		if(server.config.alarmWebHook.length) {
			data.id = id;
			request({
				method: 'POST',
				uri: server.config.alarmWebHook, 
				json: true,
				body: data
			}, function (err, httpResponse, body) {
				if (err) {
					return server.error('upload alarm failed:', err);
				}
				if(!sentAlarms[id]) {
					sentAlarms[id] = {};
				}
				sentAlarms[id][data.event] = {
					date: Math.round(Date.now() / 1000),
					data: data
				};
			});
		}
	}

	server.scheduleCronTask(300, () => {
		let now = Math.round(Date.now() / 1000);
		Object.keys(sentAlarms).forEach((id) => {
			let events = sentAlarms[id];
			Object.keys(events).forEach((eName) => {
				let data = events[eName];
				if(data.date + server.config.resendAlarmTimeout*60  < now) {
					//Remove sebt alarm - resend it again
					delete sentAlarms[id][eName];
				}
			});
			if(Object.keys(sentAlarms[id]).length === 0) {
				delete sentAlarms[id];
			}
		});
	});

	server.on('ackTimeout', (id, state, alarm) => {
		getDeviceName(id, (name) => {
			server.info('ackTimeout Event', id, name, state, alarm);
			doRequest(id, {
				event: 'ackTimeout',
				deviceName: name,
				state: state,
				reason: alarm.ackTimeout
			});
		});
    });
    server.on('criticalMinValue', (id, state, alarm) => {
        getDeviceName(id, (name) => {
            server.info('criticalMinValue Event', id, name, state, alarm);
            doRequest(id, {
				event: 'criticalMinValue',
				deviceName: name,
				state: state,
				reason: alarm.critical.min.value
			});
        });
    });
    server.on('criticalMaxValue', (id, state, alarm) => {
        getDeviceName(id, (name) => {
            server.info('criticalMaxValue Event', id, name, state, alarm);
            doRequest(id, {
				event: 'criticalMaxValue',
				deviceName: name,
				state: state,
				reason: alarm.critical.max.value
			});
        });
    });
    server.on('criticalMinHeap', (id, state, sysMinHeap) => {
        getDeviceName(id, (name) => {
            server.info('criticalMinHeap Event', id, name, state, sysMinHeap);
            doRequest(id, {
				event: 'criticalMinHeap',
				deviceName: name,
				state: state,
				reason: sysMinHeap
			});
        });
    });
    server.on('criticalHeapFragmentation', (id, state, sysMaxHeapFrag) => {
        getDeviceName(id, (name) => {
            server.info('criticalHeapFragmentation Event', id, name, state, sysMaxHeapFrag);
            doRequest(id, {
				event: 'criticalHeapFragmentation',
				deviceName: name,
				state: state,
				reason: sysMaxHeapFrag
			});
        });
    });
};