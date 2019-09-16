Vue.use(VueMaterial.default);
const oneHourSecs = 60 * 60;

function getQueryParameterByName(name, url) {
    if (!url) url = window.location.href;
    name = name.replace(/[\[\]]/g, '\\$&');
    var regex = new RegExp('[?&]' + name + '(=([^&#]*)|&|#|$)'),
        results = regex.exec(url);
    if (!results) return null;
    if (!results[2]) return '';
    return decodeURIComponent(results[2].replace(/\+/g, ' '));
}

var GoFarmService = (function () {
	let apiHost = getQueryParameterByName('apiHost');
	if(!apiHost) {
		apiHost = location.hostname;
	}
	let apiPort = getQueryParameterByName('apiPort');
	let apiUrl = `${location.protocol}//${apiHost}:${apiPort}/`;
	return {
		methods: {
			saveValue: function(name, val) {
				let url = `${apiUrl}set/${GoFarmTech.Device.deviceFullId}.${name}?value=` + JSON.stringify(val);
				return this.$http.get(url).then((data) => {
					return data.body;
				});
			},
			getValue: function(name) {
				let url = `${apiUrl}get/${GoFarmTech.Device.deviceFullId}.${name}`;
				return this.$http.get(url).then((data) => {
					return data.body.val;
				});
			},
			getDeviceDescriptions: function() {
				let getAdapters = () => {
					return this.$http.get(`${apiUrl}search/?pattern=system.adapter.gofarmtech.*`).then((data) => {
						return Object.keys(data.body.reduce((ret, item) => {
							let parts = item.split('.');
							if(parts.length > 4) {
								let num = parts[3];
								if(!isNaN(num)) {
									let id = parseInt(num);
									if(!(id in ret)) {
										ret[id] = num;
									}
								}
							}
							return ret;
						}, {}));
					});
				};
				let getAdapterDevices = (adapterId) => {
					return this.$http.get(`${apiUrl}search/?pattern=gofarmtech.${adapterId}.devices.*`).then((data) => {
						return data.body.reduce((ret, item) => {
							let parts = item.split('.');
							if(parts.length === 4) {
								let id = parts[3];
								ret[id] = item;
							}
							return ret;
						}, {});
					});
				};

				let getDeviceDescription = (deviceId, devicePath) => {
					return this.$http.get(`${apiUrl}get/${devicePath}`).then((data) => {
						return data.body.val;
					});
				};

				let getDevicesAndDescriptions = async () => {
					var descriptions = [];
					var adapterIds = await getAdapters();
					for(let i = 0; i < adapterIds.length; i++) {
						let adapterId = adapterIds[i];
						let devices = await getAdapterDevices(adapterId);
						for(let deviceId in devices) {
							let deviceFullId = devices[deviceId];
							let description = await getDeviceDescription(deviceId, devices[deviceId]);
							descriptions.push({
								adapterId,
								deviceId,
								deviceFullId,
								description
							});
						}
					}
					return descriptions;
				};

				return getDevicesAndDescriptions();
			}
		}
	};
})();

function createTimerNavigationItem() {
	return {
		icon: 'timer',
		text: 'Timer Settings',
		component: 'timer-settings',
		changed: false,
		tabs: [],
		menu: []
	};
}

function createValueNavigation(item) {
	return {
		icon: 'memory',
		text: item.nm,
		component: 'value-settings',
		changed: false,
		tabs: [],
		menu: [],
		value: item,
		invalid: [],
		changes: []
	};
}


Vue.component('timer-settings', {
	mixins: [GoFarmService],
	props: ['navigation'],
	data: function() {
		const _name = 'TimerValue';
		var timer = GoFarmTech.DeviceDescription.its.filter(item => item.nm == _name)[0];
		return {
			name: _name,
			currentTab: null,
			currentTimeslot: null,
			confirmDeleteTimeslot: false,
			newSlotError: false,
			sending: false,
			timerValue: timer
		};
	},
	created: function() {
		this.navigation.tabs = this.timerValue.its.reduce((function(init, task, idx) {
			let item = {
				id: idx,
				text: task.nm,
				enabled: task.ats.filter(item => item.nm == 'enabled')[0],
				changed: false,
				onSelectTab: this.onSelectTab.bind(this),
				timeslots: this.wrapTimeslots(task.v)
			};
			init.push(item);
			this.getValue(`${this.name}.${task.nm}.enabled`).then((onOff) => {
				item.enabled.v = onOff;
			});
			return init;
		}).bind(this), []);
		this.currentTab = this.navigation.tabs[0];

		this.navigation.menu = [
			{
				id: 0,
				icon: 'timer',
				text: 'Add Timeslot',
				enabled: this.addTimeslotAvailable.bind(this),
				onClick: this.onAddTimeslot.bind(this)
			}
		];
		return;
	},
	methods: {	
		onSelectTab: function(tab) {
			if(this.currentTab == tab) {
				return;
			}
			this.currentTab = null;
			setTimeout(() => {
				this.currentTab = tab;
			}, 250);
			return;
		},
		onAddTimeslot: function() {
			var newSlot = this.currentTab.timeslots.getFreeTimeslot();
			if(!newSlot) {
				this.newSlotError = true;
				return;
			}
			this.currentTab.timeslots.push({
				id: newSlot.id,
				st: newSlot.start,
				en: newSlot.end,
				dur: 10,
				ev: 300,
				ds:  127,
				mns: 4095
			});
			this.currentTab.changed = true;
		},
		wrapTimeslots: function(arr) {
			arr.getFreeTimeslot = function() {
				if(!this.length) {
					return {
						id: 0,
						start: 0,
						end: oneHourSecs * 6
					};
				} else {
					var last = this[this.length - 1];
					var newEnd = (last.en > 18 * oneHourSecs? 24 * oneHourSecs : last.en + oneHourSecs * 6);
					if(newEnd == last.en) {
						return null;
					}
					return {
						id: last.id + 1,
						start: last.en,
						end: newEnd
					}
				}
			};
			arr.deleteTimeslot = function (timeslot) {
				var id = this.indexOf(timeslot);
				if(id !== -1) {
					this.splice(id, 1);
					if(id < this.length)
						this.updateTimeslotLimits(this[id], true);
				}
			};
			arr.updateTimeslotLimits = function (item, bStart) {
				var i = this.indexOf(item);
				if(i === -1) {
					return;
				}
		
				if(bStart && i > 0) {
					var prev = this[i - 1];
					prev.en = item.st;
				} else if(!bStart && i + 1 < this.length) {
					var next = this[i + 1];
					next.st = item.en;
				}
			};
			var push_method = arr.push;
			arr.push = function(item) {
				item.dirty = {
					start: false,
					end: false,
					every: false,
					duration: false,
					days: false
				};
				push_method.call(arr, item);
			};

			arr.removeDirty = function() {
				for(var i = 0; i < this.length; i++) {
					var item = this[i];
					delete item.dirty;
				}
			};

			arr.applyDirty = function() {
				for(var i = 0; i < this.length; i++) {
					this[i].dirty = {
						start: false,
						end: false,
						every: false,
						duration: false,
						days: false
					};
				}
			};

			arr.applyDirty();
			return arr;
		},
		onRemoveTimeslot: function (timeslot) {
			this.currentTimeslot = timeslot;
			this.confirmDeleteTimeslot = true;
		},
		onDeleteSlot: function() {
			this.currentTab.timeslots.deleteTimeslot(this.currentTimeslot);
			this.currentTab.changed = true;
			this.onCancelDeleteTimeslot();
		},
		onCancelDeleteTimeslot: function() {
			this.currentTimeslot = null;
			this.confirmDeleteTimeslot = false;
		},
		onApplyChanges: function() {
			this.currentTab.changed = false;
			this.currentTab.timeslots.removeDirty();
			this.saveValue(this.name + '.' + this.currentTab.text, this.currentTab.timeslots);
			this.currentTab.timeslots.applyDirty();
		},
		onEnableTimer: function(enabled) {
			this.saveValue(this.name + '.' + this.currentTab.text + '.enabled', enabled);
			return;
		},
		addTimeslotAvailable: function() {
			return this.currentTab && this.currentTab.enabled.v;
		},
		updateLimits: function(item, bStart) {
			this.currentTab.changed = true;
			if(item) {
				this.currentTab.timeslots.updateTimeslotLimits(item, bStart);
			}
		}
	},
	template: '\
	<div class="timer-settings-container">\
		<md-switch @change="onEnableTimer" v-if="currentTab" v-model="currentTab.enabled.v" class="md-primary"><b>{{currentTab.enabled.v ? "Enabled" : "Disabled"}}</b></md-switch>\
		<div v-if="currentTab" :class="{disabled: !currentTab.enabled.v}">\
			<md-list>\
				<timeslot-entry v-for="timeslot in currentTab.timeslots" v-bind:timeslot="timeslot" :key="timeslot.id" v-on:remove-timeslot="onRemoveTimeslot" v-on:update-timeslot="updateLimits"></timeslot-entry>\
			</md-list>\
			<md-button type="submit" class="md-primary" :disabled="!currentTab.changed || sending" @click="onApplyChanges()">Apply</md-button>\
		</div>\
		<md-dialog-confirm \
				:md-active.sync="confirmDeleteTimeslot"\
      			md-title="Delete timeslot?"\
      			md-content="Do you want to delete selected timeslot?"\
      			md-confirm-text="YES"\
      			md-cancel-text="NO"\
      			@md-cancel="onCancelDeleteTimeslot"\
				@md-confirm="onDeleteSlot"></md-dialog-confirm>\
		<md-dialog-alert :md-active.sync="newSlotError" md-content="New timeslot unavailable. Change the previous timeslot settings" md-confirm-text="OK"></md-dialog-alert>\
	</div>',
});

(function () {
	function formatNum(val) {
		if(val < 10) {
			return '0' + val
		}
		return val;
	}
	Vue.filter('timeText', function (val) {
		if(val < 60) {
			return '00:00:' + formatNum(val);
		}

		if(val < oneHourSecs) {
			var ret = formatNum(Math.floor(val / 60)) + ':' + formatNum(val % 60);
			return '00:' + ret;
		} else {
			var hours = Math.floor(val / oneHourSecs);
			var mins = Math.floor((val - hours * oneHourSecs) / 60);
			return formatNum(hours) + ':' + formatNum(mins) + ':' + formatNum((val - hours * oneHourSecs - mins * 60) % 60);
		}
	});

	Vue.filter('timeIntervalText', function (val) {
		if(val < 60) {
			return val + ' sec';
		}
		if(val < oneHourSecs) {
			var minutes = Math.floor(val / 60);
			var secs = val % 60;
			return minutes + ' min ' + (secs ? secs + ' sec' : '');
		} else {
			var hours = Math.floor(val / oneHourSecs);
			var mins = Math.floor((val - hours * oneHourSecs) / 60);
			var secs = (val - hours * oneHourSecs - mins * 60) % 60;
			return hours + ' hour ' + (mins ? mins + ' min ' : '') + (secs ? secs + ' s' : '');
		}
	});
})();

Vue.component('timeslot-entry', {
	props: ['timeslot'],
	data: function () {
		return {};
	},
	created: function() {
		if(!this.timeslot.dirty) {
			this.timeslot.dirty = {
				start: false,
				end: false,
				every: false,
				duration: false,
				days: false
			};
		}
	},
	template: 	'<md-list-item :key="timeslot.id" class="timeslot-list-item">\
					<div class="timeslot-list-item-days">\
						<div class="timeslot-list-item-day" v-for="(day, index) in [\'su\', \'mo\', \'tu\', \'we\', \'th\', \'fr\', \'sa\']" :class="{inactive: (timeslot.ds & 1 << index) ? false : true}" @click="(timeslot.ds & 1 << index) ? timeslot.ds -= (1 << index) : timeslot.ds += (1 << index) ">{{day}}</div>\
						<i class="timeslot-list-item-star">{{timeslot.dirty.days? "*" : ""}}</i>\
					</div>\
					<span class="md-list-item-text">\
						<div>\
							<label><strong>Starts at {{timeslot.st | timeText}}<i class="timeslot-list-item-star">{{timeslot.dirty.start? " *" : " "}}</i></strong></label>\
							<input type="range" min="0" max="86400" step="60" v-model="timeslot.st"/>\
						</div>\
						<div>\
							<label><strong>Every {{timeslot.ev | timeIntervalText}}<i class="timeslot-list-item-star">{{timeslot.dirty.every? " *" : " "}}</i></strong></label>\
							<input type="range" min="0" :max="timeslot.en - timeslot.st" :step="evalEveryStep(timeslot.ev)" v-model="timeslot.ev"/>\
						</div>\
						<div>\
							<label><strong>Duration {{timeslot.dur | timeIntervalText}}<i class="timeslot-list-item-star">{{timeslot.dirty.duration? " *" : " "}}</i></strong></label>\
							<input type="range" min="0" :max="timeslot.ev" :step="evalDurationStep(timeslot.dur)" v-model="timeslot.dur"/>\
						</div>\
						<div>\
							<label><strong>Ends at {{timeslot.en | timeText}}, {{(timeslot.en - timeslot.st) | timeIntervalText}}<i class="timeslot-list-item-star">{{timeslot.dirty.end? " *" : " "}}</i></strong></label>\
							<input type="range" min="0" max="86400" step="60" v-model="timeslot.en"/>\
						</div>\
					</span>\
					<md-button @click="$emit(\'remove-timeslot\', timeslot)" class="md-icon-button timeslot-delete-button"><md-icon >close</md-icon></md-button>\
				</md-list-item>\
				',
	watch: {
		'timeslot.ds': function (val, old) {
			this.$emit('update-timeslot');
			this.timeslot.dirty.days = true;
		},
		'timeslot.st': function (val) {
			this.timeslot.dirty.start = true;
			this.updateValidState(true);
			this.$emit('update-timeslot', this.timeslot, true);
		},
		'timeslot.en': function (val) {
			this.timeslot.dirty.end = true;
			this.updateValidState(false);
			this.$emit('update-timeslot', this.timeslot, false);
		},
		'timeslot.ev': function (val) {
			this.timeslot.dirty.every = true;
			this.$emit('update-timeslot');
			this.updateValidState();
		},
		'timeslot.dur': function (val) {
			this.timeslot.dirty.duration = true;
			this.$emit('update-timeslot');
			this.updateValidState();
		}
	},
	methods: {
		updateValidState: function (bStart) {
			this.timeslot.en = parseInt(this.timeslot.en);
			this.timeslot.st = parseInt(this.timeslot.st);
			this.timeslot.ev = parseInt(this.timeslot.ev);
			this.timeslot.dur = parseInt(this.timeslot.dur);
			if(bStart === true) {
				if(this.timeslot.en < this.timeslot.st) {
					this.timeslot.en = this.timeslot.st;
				}
			} else if(bStart === false) {
				if(this.timeslot.en < this.timeslot.st) {
					this.timeslot.st = this.timeslot.en;
				}
			}
			var total = this.timeslot.en - this.timeslot.st;
			if(this.timeslot.ev > total) {
				this.timeslot.ev = total;
			}

			if(this.timeslot.dur > this.timeslot.ev) {
				this.timeslot.dur = this.timeslot.ev;
			}
		},
		evalEveryStep: function (val) {
			if(val < 60) {
				return 5;
			} else if(val < oneHourSecs) {
				return 15;
			} else if(val < oneHourSecs * 3) {
				return 30;
			} else if(val < oneHourSecs * 6) {
				return 60;
			}
			return 120;
		},
		evalDurationStep: function (val) {
			if(val < 60) {
				return 1;
			} else if(val < 60*10) {
				return 5;
			} else if(val < oneHourSecs) {
				return 10;
			} else if(val < oneHourSecs * 6) {
				return 15;
			}
			return 30;
		}
	}
});

Vue.component('value-settings', {
	mixins: [GoFarmService],
	props: ['navigation'],
	data: function() {
		return {
			render: true,
			updated: false,
			sending: false,
			resultMsg: ''
		};
	},
	created: function() {
		this.getActualValues();
	},
	methods: {
		onChange: function(fieldName) {
			this.navigation.changed = true;
			if(this.navigation.changes.indexOf(fieldName) == -1) {
				this.navigation.changes.push(fieldName);
			}
		},
		validate: function() {
			async function saveAll() {
				var changes = this.navigation.changes;
				var valueName = this.navigation.value.nm;
				for(var i = 0; i < changes.length; i++) {
					var name = changes[i];
					if(valueName === name) {
						await this.saveValue(name, this.navigation.value.v);
					} else {
						var item = this.navigation.value.ats.filter(item => item.nm == name)[0];
						await this.saveValue(valueName + '.' + name, item.v);
					}
				}
				this.navigation.changed = false;
				this.navigation.changes = [];
			}

			saveAll.bind(this)();
		},
		getActualValues: async function() {
			this.render = false;
			var valueName = this.navigation.value.nm;
			var val = await this.getValue(valueName);
			if(val !== null && this.navigation.value.v !== val) {
				this.navigation.value.v = val;
			}
			for(var i = 0; i < this.navigation.value.ats.length; i++) {
				var item = this.navigation.value.ats[i];
				val = await this.getValue(valueName + "." + item.nm);
				if(val !== null && item.v !== val) {
					item.v = val;
				}
			}
			setTimeout(() => {
				this.navigation.changed = false;
				this.navigation.changes = [];
				this.render = true;
			}, 250);
		}
	},
	watch: {
		'navigation': function(val) {
			this.getActualValues();
			return;
		}
	},
	template: '\
	<form v-if="render" novalidate class="md-layout" @submit.prevent="validate">\
		<md-card class="md-layout-item md-size-100 md-small-size-100">\
			<md-card-header>\
				<div class="md-title">{{navigation.text}} Settings</div>\
			</md-card-header>\
			<md-card-content>\
					<value-field :value="navigation.value" :sending="sending" :invalid="navigation.invalid" :changed="onChange"></value-field>\
					<div class="md-layout-item md-small-size-100" md-size-50 v-for="attribute in navigation.value.ats">\
						<value-field :value="attribute" :sending="sending" :invalid="navigation.invalid" :changed="onChange"></value-field>\
					</div>\
			</md-card-content>\
			<md-progress-bar md-mode="indeterminate" v-if="sending" />\
			<md-card-actions>\
				<md-button type="submit" class="md-primary" :disabled="navigation.invalid.length > 0 || navigation.changes.length == 0 || sending">Apply</md-button>\
			</md-card-actions>\
		</md-card>\
		<md-snackbar :md-active.sync="updated">{{resultMsg}}</md-snackbar>\
	</form>'
});

Vue.component('value-field', {
	props: ['value', 'sending', 'invalid', 'changed'],
	data: function() {
		minVal = 0;
		maxVal = 999999;
		step = 1;
		if(this.value.tp === GoFarmTech.Type.number) {
			if(this.value.v < 0) {
				minVal = -100;
				maxVal = 250;
				step = 1;
			}
			else if(this.value.v < 100) {
				maxVal = 250;
				step = 1;
			} else if(this.value.v < 1000) {
				maxVal = 1500;
				step = 10;
			} else if(this.value.v < 10000) {
				maxVal = 15000;
				step = 50;
			}
		}
		return {
			minVal: minVal,
			maxVal: maxVal,
			step: step,
			GoFarmTech_Access : GoFarmTech.Access,
			GoFarmTech_Type: GoFarmTech.Type
		};
	},
	template: '\
	<div>\
		<div v-if="value.ac > GoFarmTech_Access.read ? true : false">\
			<span v-if="value.tp === GoFarmTech_Type.boolean">\
				<md-switch :disabled="sending" v-model="value.v" class="md-primary">{{value.nm}}</md-switch>\
			</span>\
			<md-field :class="valueClass()" v-else>\
				<div v-if="value.tp === GoFarmTech_Type.string" class="md-layout-item md-small-size-100" md-size-50>\
					<label v-bind:for="value.nm">{{value.nm}}</label>\
					<md-input\
						:disabled="sending"\
						v-bind:name="value.nm"\
						v-bind:id="value.nm"\
						v-model="value.v"\
						required="required"\
						type="text"/>\
				</div>\
				<div v-if="value.tp === GoFarmTech_Type.number" class="md-layout-item md-small-size-100" md-size-50>\
					<label v-bind:for="value.nm">{{value.nm}}: <b>{{value.v}}</b></label>\
					<md-input\
						:disabled="sending"\
						v-bind:name="value.nm"\
						v-bind:id="value.nm"\
						v-model="value.v"\
						required="required"\
						:min="minVal" \
						:max="maxVal"\
						:step="step"\
						type="range"/>\
				</div>\
				<span class="md-error">Wrong field value</span>\
			</md-field>\
		</div>\
		<div v-else>\
			<h3>{{value.nm}}: {{value.v}}</h3>\
		</div>\
	</div>',
	methods: {
		valueClass: function() {
			var invalid = (this.value.tp === GoFarmTech.Type.string ? this.value.v.length === 0 : false);
			if(invalid) {
				if(this.invalid.indexOf(this.value.nm) == -1)
					this.invalid.push(this.value.nm);
			} else {
				var id = this.invalid.indexOf(this.value.nm);
				if(id != -1) {
					this.invalid.splice(id, 1);
				}
			}
			return {
				'md-invalid': invalid
			};
		}
	},
	watch: {
		'value.v': function() {
			this.changed(this.value.nm);
		}
	}
});

var app = new Vue({
	el: 'md-app',
	mixins: [GoFarmService],
	data: {
		showNavigation: false,
		mobileNavigation: false,
		nowText: '',
		confirmDeleteTimeslot: false,
		navigationDirtyError: false,
		navigations : [	],
		currentNavigation: null,
		initialized: false,
		deviceName: '',
		devices: []
	},
	created: function () {
		this._initEnums();
		this._startClock();
		this._handleSmallScreen();
		this._initDeviceInfo();
	},
	methods: {
		_initEnums: function() {
			window.GoFarmTech = {};
			window.GoFarmTech.Type = [
				'boolean',
				'string',
				'number',
				'array',
				'object',
				'mixed'
			].reduce(function(init, item, id) {
				init[item] = id;
				return init;
			}, {});
			window.GoFarmTech.Access = [
				'read',
				'write',
				'all'
			].reduce(function(init, item, id) {
				init[item] = id;
				return init;
			}, {});
		},
		_initTitle: function() {
			document.querySelector("head title").innerText = GoFarmTech.DeviceDescription.nm + " Settings";
		},
		_initHeader: function () {
			this.deviceName = GoFarmTech.DeviceDescription.nm;
		},
		_initNavigations: function() {
			this.navigations = [];
			var addNavigation = (function(item) {
				item.id = this.navigations.length;
				this.navigations.push(item);
			}).bind(this);
			addNavigation(createTimerNavigationItem());
			GoFarmTech.DeviceDescription.its.forEach(function(item) {
				if(item.nm == 'TimerValue') {
					return;
				} else {
					addNavigation(createValueNavigation(item));
				}
			});
			this.currentNavigation = this.navigations[0];
		},
		_initDeviceInfo: function() {
			this.getDeviceDescriptions().then((data) => {
				GoFarmTech.Devices = data;
				this.devices = data;
				if(data.length) {
					GoFarmTech.Device = data[0];
					GoFarmTech.DeviceDescription = GoFarmTech.Device.description;
					this._initHeader();
					this._initTitle();
					this._initNavigations();
				}
				this.initialized = true;
			});
		},
		_startClock: function () {
			const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
			var formatTimeNum = ((val) => {
				return (val < 10 ? '0' + val : val + '');
			});
			var runTimer = (() => {
				var date = new Date();
				var text = days[date.getDay()] + " " + formatTimeNum(date.getHours()) + ":" + formatTimeNum(date.getMinutes()) + ":" + formatTimeNum(date.getSeconds());
				if(this.nowText != text) {
					this.nowText = text;
				}
			}).bind(this);
			runTimer();
			setInterval(runTimer, 1000);
		},
		_handleSmallScreen : function() {
			var mql = window.matchMedia('(max-width: 600px) and (min-width: 0)');
			this.mobileNavigation = mql.matches ? true : false;
			mql.addListener((function(e) {
				this.mobileNavigation = e.matches ? true : false;
			}).bind(this));
		},
		onNavigate: function(navigation) {
			if(this.currentNavigation.changed || this.currentNavigation.tabs.filter(tab => tab.changed).length > 0) {
				this.navigationDirtyError = true;
				return;
			}
			this.currentNavigation = navigation;
		},
		onSelectDevice: function (device) {
			this.initialized = false;
			this.navigations = [];
			this.currentNavigation = null;
			setTimeout(() => {
				this.initialized = true;
				GoFarmTech.Device = device;
				GoFarmTech.DeviceDescription = GoFarmTech.Device.description;
				this._initHeader();
				this._initTitle();
				this._initNavigations();
			}, 200);
		}
	}
});