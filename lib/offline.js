'use strict';

module.exports = function OfflineService(server) {

	let offlineClients = {};
	async function flushClientStates(clientId) {
		//Check the client ID registered in offline states
		if(clientId in offlineClients) {
			let states = offlineClients[clientId];
			let stateIds = Object.keys(states);
			let sentStates = [];
			//Iterate all preserved states
			for(var i = 0; i < stateIds.length; i++) {
				let id = stateIds[i];
				let state = states[i];
				try {
					//Send state to the client
					await server.publishToClient(id, state, true);
					//Mark state as sent
					sentStates.push(id);
				} catch (e) {
					//Stop publishing
					break;
				}
			}
			//Delete sent states from offlineClients
			sentStates.forEach((id) => {
				delete offlineClients[clientId][id];
			});
			//Delete clientId if all states are flushed
			if(!Object.keys(offlineClients[clientId]).length) {
				delete offlineClients[clientId];
				server.info(`All client #${clientId} states are flushed`);
			}
		}
	}

	server.on('offlineState', (clientId, id, state) => {
		server.info('offlineState Event', id);
		if(!(clientId in offlineClients)) {
			offlineClients[clientId] = {};
		}
		//Preserve state for the offline device
		offlineClients[clientId][id] = state;
	});

	server.on('clientConnect', clientId => {
		server.info('clientConnect Event', clientId);
		//Flush all preserved states to the online client;
		setTimeout(flushClientStates, 1000, clientId);
	});
};