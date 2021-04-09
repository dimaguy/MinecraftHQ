"use strict";
var connection = null;
var firstLogin = true;
var loggedIn = false;
var playersOnline = 0;
var maxPlayers = 0;
var cpuUsage = 0;
var ramUsage = 0;
var _playerchart = null;
var _cpuchart = null;
var _ramchart = null;

var playerChart = document.getElementById('playerChart');
var ctxPlayers = playerChart.getContext('2d');

var cpuChart = document.getElementById('cpuChart');
var ctxCpu = cpuChart.getContext('2d');

var ramChart = document.getElementById('ramChart');
var ctxRam = ramChart.getContext('2d');

var encryptionKey = "";

const MessageFlags =
{
	LoginApiRequest: "0",      // A request to log in, with a given API key.
	LoginApiAccepted: "1",     // The API Key is correct, so the login is successful.
	LoginApiRejected: "2",     // The API key is incorrect, so the login is rejected.
	ConsoleLogMessage: "3",    // Server Message
	ConsoleCommand: "4",       // A command sent from the dashboard to the API.
	HeartbeatMessage: "5",     // Quick sanity check with some statistics
	DoKickOrDisconnect: "6",   // A message when a client is kicked or the server shuts down.
}

window.onload = onload();
function onload() {
	document.getElementById("chatbox").value = "";
	var autoapi = window.location.href.match(/\?apikey=(.*)/);
	if (autoapi != null) {
	document.getElementById("apikey").value = autoapi[1];
	}
}

function connect() {
	if (document.getElementById("apikey").value == null) {
		console.error("Empty Api Key");
		return;
	};
	encryptionKey = document.getElementById("apikey").value;
	var serverUrl;
	var scheme = "ws";

	if (document.location.protocol === "https:") {
		scheme += "s";
	};

	serverUrl = scheme + "://" + document.location.hostname + ":8420";

	connection = new WebSocket(serverUrl);

	connection.onopen = function (evt) {
		document.getElementById("status").innertext = "";
		var auth = {
			Text: document.getElementById("apikey").value,
			Type: MessageFlags.LoginApiRequest,
			Date: Date.now(),
			Padding: Math.floor(Math.random() * 999999999) + 1000000000
		};
		sendEncrypted(JSON.stringify(auth));
	};

	connection.onerror = function (event) {
		console.error("WebSocket error observed: ", event);
		document.getElementById("status").innertext = "WebSocket Error: " + event.type;
		document.getElementById("text").value = "";
		document.getElementById("text").disabled = true;
		document.getElementById("send").disabled = true;
	};

	connection.onmessage = function (evt) {
		var box = document.getElementById("chatbox");
		var text = "";
		var msg;
		if(loggedIn) msg = JSON.parse(decrypt(evt.data,encryptionKey));
		else msg = JSON.parse(evt.data);

		console.debug(msg);
		var time = new Date(msg.Date);
		var timeStr = time.toLocaleTimeString();

		switch (msg.Type) {
			case MessageFlags.ConsoleLogMessage:
				text = "(" + timeStr + ") [" + msg.Name + "] : " + msg.Text + "\n";
				break;
			case MessageFlags.LoginApiAccepted:
				encryptionKey = document.getElementById("apikey").value;
				loggedIn = true;
				document.getElementById("status").style.color = "green";
				document.getElementById("status").innertext = "Logged in!";
				document.getElementById("text").value = "";
				document.getElementById("PlayersCSV").href = "/players.json";
				document.getElementById("text").disabled = false;
				document.getElementById("send").disabled = false;
				if (!firstLogin) {
					_playerchart.destroy();
					_cpuchart.destroy();
					_ramchart.destroy();
				};
				plot();
				firstLogin = false
				console.log("API Key Accepted");
				break;

			case MessageFlags.LoginApiRejected:
				document.getElementById("status").style.color = "red";
				document.getElementById("status").innertext = "Api Key Error!";
				document.getElementById("text").disabled = true;
				document.getElementById("send").disabled = true;
				console.log("API Key Rejected")
				loggedIn = false;
				break;

			case MessageFlags.DoKickOrDisconnect:
				document.getElementById("status").style.color = "red";
				document.getElementById("status").innertext = "Kicked:" + msg.Text;
				document.getElementById("text").value = "";
				document.getElementById("text").disabled = true;
				document.getElementById("send").disabled = true;
				document.getElementById("PlayersCSV").href = "";
				_playerchart.destroy();
				_cpuchart.destroy();
				_ramchart.destroy();
				console.error("Kicked: " + msg.Text)
				loggedIn = false;
				break;

			case MessageFlags.HeartbeatMessage:
				var tokens = msg.Flags;
				document.getElementById("Version").innertext = tokens[0];
				document.getElementById("Players").innertext = tokens[2];
				document.getElementById("Uptime").innertext = tokens[3];
				playersOnline = tokens[2];
				maxPlayers = tokens[1];
				cpuUsage = tokens[4];
				ramUsage = tokens[5];
				console.debug("Heartbeat");
				break;
		}

		if (text.length) {
			box.value += text;
			box.scrollTop = box.scrollHeight;
		};
	};
};

function send() {
	if (document.getElementById("text").value != null) {
		console.log("***SEND");
		var msg = {
			Text: document.getElementById("text").value,
			Type: MessageFlags.ConsoleCommand,
			Date: Date.now()
		};
		console.debug("Message sent: ")
		console.debug(msg)
		sendEncrypted(JSON.stringify(msg));
		document.getElementById("text").value = "";
	};
};
function sendEncrypted(data){
	connection.send(encrypt(data,encryptionKey));
}
function plot() {
	_playerchart = new Chart(ctxPlayers, {
		type: 'line',
		data: {

			datasets: [{
				label: 'Players',
				borderColor: 'rgb(255, 99, 132)',
				backgroundColor: 'rgba(255, 99, 132, 0.5)',
				lineTension: 0,
				borderDash: [8, 4]

			},
			{
				label: 'Max Players',
				borderColor: 'rgb(54, 162, 235)',
				backgroundColor: 'rgba(54, 162, 235, 0.5)',
				lineTension: 0,
			}

			]
		},

		options: {
			responsive: true,
			maintainAspectRatio: false,
			scales: {
				yAxes: [{
					ticks: {
						beginAtZero: true,
						precision: 0
					}
				}],
				xAxes: [{
					type: 'realtime',
					realtime: {
						delay: 5000,
						duration: 60000 * 5,
						onRefresh: function (chart) {
							chart.data.datasets[0].data.push({
								x: Date.now(),
								y: playersOnline
							});
							chart.data.datasets[1].data.push({
								x: Date.now(),
								y: maxPlayers
							});
						}
					}
				}]
			}
		},

	});
	_cpuchart = new Chart(ctxCpu, {
		type: 'line',
		data: {

			datasets: [{
				label: 'CPU Usage (%)',
				borderColor: 'rgb(255, 0, 132)',
				backgroundColor: 'rgba(255, 99, 132, 0.5)',
				lineTension: 0,
				borderDash: [8, 4]

			}

			]
		},

		options: {
			responsive: true,
			maintainAspectRatio: false,
			scales: {
				yAxes: [{
					ticks: {
						beginAtZero: true,
						precision: 0
					}
				}],
				xAxes: [{
					type: 'realtime',
					realtime: {
						delay: 5000,
						duration: 60000,
						onRefresh: function (chart) {
							chart.data.datasets[0].data.push({
								x: Date.now(),
								y: cpuUsage
							});
						}
					}
				}]
			}
		},

	});
	_ramchart = new Chart(ctxRam, {
		type: 'line',
		data: {

			datasets: [{
				label: 'Memory Usage (MB)',
				borderColor: 'rgb(255, 0, 255)',
				backgroundColor: 'rgba(255, 99, 132, 0.5)',
				lineTension: 0,
				borderDash: [8, 4]

			}

			]
		},

		options: {
			responsive: true,
			maintainAspectRatio: false,
			scales: {
				yAxes: [{
					ticks: {
						beginAtZero: true,
						precision: 0
					}
				}],
				xAxes: [{
					type: 'realtime',
					realtime: {
						delay: 5000,
						duration: 60000,
						onRefresh: function (chart) {
							chart.data.datasets[0].data.push({
								x: Date.now(),
								y: ramUsage
							});
						}
					}
				}]
			}
		},

	});
};

function handleSend(evt) {
	if (evt.keyCode === 13 || evt.keyCode === 14) {
		if (!document.getElementById("send").disabled) {
			send();
		};
	};
};
function HandleLogin(evt) {
	if (evt.keyCode === 13 || evt.keyCode === 14) {
		connect();
	};
};
function openInNewTab(url) {
	var win = window.open(url, '_blank');
	win.focus();
}
