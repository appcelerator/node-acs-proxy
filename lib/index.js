var WebSocket = require('ws'),
	prompt = require('prompt'),
  	events = require('events'),
  	util = require('util'),
  	debug = require('debug')('Server'),
  	colors = require('colors'),
  	ip = require('ip'),
  	url = require('url'),
  	request = require('request');

function msg() {
	var args = Array.prototype.slice.call(arguments, 0);
	console.log('[REMOTE]'.magenta, args.join(' '));
}

function Server(app, server, config) {
	if (!isRunningLocally()) {
		debug('running in production, skipping');
		return;
	}
	config = config || {};
	var uri = config.url || process.env.NODEACS_REMOTE || 'wss://3a8fa4eec99ad64084a47dd94e5142321cddd9ec.cloudapp.appcelerator.com';
	var username = config.username;	
	var password = config.password;
	var Self = function(){};

	util.inherits(Self, events.EventEmitter);
		
	var self = new Self();

	self.app = app;

	prompt.message = '';
  	prompt.delimiter = '';

	if (!username || !password) {
		msg('Login required to connect to remote server');
		prompt.start();

		var fields = [];
		if (!username) {
			fields.push({
				name:'username',
				required: true
			});
		}
		if (!password) {
			fields.push({
				name:'password',
				required: true,
				hidden: true
			});
		}

		prompt.get(fields, function (err, result) {
		    username = result.username;
		    password = result.password;
		    start.bind(self)();
		});
	}
	else {
		start.bind(self)();
	}

	process.on('exit', stop);
	process.on('SIGINT', stop);

	function stop() {
		self.send('logout');
		process.exit(0);
	}

	function start() {
		var uriparts = url.parse(uri);
		msg('Connecting to remote server',uriparts.host.cyan);
		this.ws = new WebSocket(uri);

		this.ws.on('error',function(e){
			msg('ERROR',String(e));
		});

		this.ws.on('open', function() {
			this.send('login',{
				username: username, 
				password: password,
				ipaddress: ip.address(),
				user: process.env.USER || process.env.LOGNAME
			});
		}.bind(this));

		this.ws.on('message', function(data, flags) {
			if (data && typeof(data)==='string') {
				try {
					data = JSON.parse(data);
					if (data.event) {
						this.emit(data.event, data.payload);
					}
				}
				catch (E) {
					//ignore
					debug('message receive error',E)
				}
			}
		}.bind(this));
	}

	self.send = function(name, payload) {
		if (this.ws) {
			var evt = {
				event: name,
				payload: payload || {},
				key: this.key
			};
			try {
				this.ws.send(JSON.stringify(evt));
			}
			catch (E) {
				console.log(E,E.message);
			}
		}
	};

	// called when we have an invalid login
	self.on('error', function(data){
		if (data && data.message) {
			return msg('Error:',data.message.red);
		}
		return msg('Error:',data);
	});

	// called once we have a valid login
	self.on('connected', function(data){
		self.key = data.key;
		self.url = data.url;
		debug('Connected',data);
		msg('App will be available at '+data.url.cyan);
	});

	// called on an incoming (external) request
	self.on('route', function(data){
		debug('route called',data);

		var addr = server.address();
		var url = 'http://'+addr.address+':'+addr.port+'/'+data.path;
		var opts = {
			method: data.method,
			headers: data.headers,
			url: url
		};

		// to be safe and accurate, just do a local request to our webserver
		request(opts, function(err, resp, body) {
			var result = {
				status: resp && resp.statusCode,
				error: err,
				headers: resp && resp.headers,
				body: body,
				uid: data.uid
			};
			self.send('response',result);
		});

	});

	return self;
}

function isRunningLocally() {
	return !process.env.appid && 
			!process.env.serverId;
}

exports = module.exports = Server;