console.log("Booting up MinecraftHQ");
console.log("Loading Dependencies");
const fastify = require('fastify')({logger: true});
const path = require('path');
const Query = require('mcquery');
const RCON = require('rcon');
const WebSocket = require('ws');
const {v4: uuidv4} = require('uuid');
const fs = require('fs');
const cfgpath = './config.json';
const {waitFor} = require('wait-for-event');
const os = require('os-utils');
eval(fs.readFileSync('blackTea.js')+'');
eval(fs.readFileSync('md5.js')+'');

console.log("Loading configuration file or environment variables");

try {
  if (!fs.existsSync(cfgpath)) {
    const defaults = {
      host: "127.0.0.1",
      queryport: 25565,
      rconport: 25575,
      rconpass: "INSERTPASSHERE",
      httpadress: "0.0.0.0",
      httpport: 8008,
      wsport: 8420,
      apikeys: []
    }
    fs.writeFileSync(cfgpath, JSON.stringify(defaults,null,2), function writeJSON(err) {
      if (err) return console.error(err);
    })
    console.log("Configuration file not found, created a new one")
    createDefaultkey()
  }
} catch(err) {
  console.error(err)
}

var config = require(cfgpath);
const HOST = process.env.MC_SERVER || config.host;
const QUERYPORT = process.env.QUERY_PORT || config.queryport;
const RCONPORT = process.env.RCON_PORT || config.rconport;
const RCONPASS = process.env.RCON_PASS || config.rconpass;
const WSPORT = process.env.WS_PORT || config.wsport;
const HTTPADDR = process.env.HTTP_ADDR || config.httpaddress;
const HTTPPORT = process.env.HTTP_PORT || config.httpport;
const APIKEYS = process.env.APIKEYS || config.apikeys;

if (APIKEYS.length == 0) {
  createDefaultkey()
};

function createDefaultkey() {
  const newkey = uuidv4();
  config.apikeys.push(newkey);
  fs.writeFileSync(cfgpath, JSON.stringify(config,null,2), function writeJSON(err) {
    if (err) return console.log(err);
  });
  console.log(JSON.stringify(config));
  console.log("No api keys found, generated a new one: " + newkey);
}
console.log("Enabling WebSocket API");
const wss = new WebSocket.Server({ port: WSPORT });

const MessageFlags =
{
	LoginApiRequest: "0",      // A request to log in, with a given API key.
	LoginApiAccepted: "1",     // The API Key is correct, so the login is successful.
	LoginApiRejected: "2",     // The API key is incorrect, so the login is rejected.
	ConsoleLogMessage: "3",    // Server Message
	ConsoleCommand: "4",       // A command sent from the dashboard to the API.
	HeartbeatMessage: "5",     // Quick sanity check with some statistics
	GameListMessage: "6",      // Not implemented yet.
	DoKickOrDisconnect: "7"    // A message when a client is kicked or the server shuts down.
};

wss.on('connection', function connection(ws) {
  ws.id = uuidv4()
  const socketProps = {
    authenticated: false,
    waitingresponse: false,
    key: ""
  };
  ws.socketProps = socketProps
  ws.on('message', function incoming(message) {
    console.debug('Received: %s', message);
    if (!socketProps.authenticated) {
      APIKEYS.forEach(element => {
        try {
        if (JSON.parse(decrypt(message,element)).Text == element) {
          socketProps.authenticated = true;
          console.log("Authenticated:" + ws.id + " with key " + element);
          socketProps.key = element;
          const apikeyaccept = {
            Type: MessageFlags.LoginApiAccepted
          };
          ws.send(JSON.stringify(apikeyaccept));
        }; 
        } catch(e) {}
        if (!socketProps.authenticated) {
          const apikeyreject = {
            Type: MessageFlags.LoginApiRejected
          };
          ws.send(JSON.stringify(apikeyreject));
          console.log("Access Denied: " + id);
        };
      }); 
    } else {
      msg = JSON.parse(decrypt(message,socketProps.key))
      console.log(msg);
      switch (msg.Type) {
        case MessageFlags.ConsoleCommand:
        queue.push({key: socketProps.key, command: msg.Text})
        console.log(queue)
        socketProps.waitingresponse = true;
        break;
      };
    };
  });
});


console.log("Enabling RCON");
var rcon = new RCON(HOST, RCONPORT, RCONPASS);
rcon.on('auth', function() {
  console.log("Authed!");

}).on('end', function() {
  console.log("Socket closed!");
  wss.clients.forEach(ws => {
    const Disconnect = {
      Text: "RCON Socket disconnected :(",
      Type: MessageFlags.DoKickOrDisconnect,
      Date: Date.now()
    };
    ws.send(encrypt(JSON.stringify(Disconnect),ws.socketProps.key));
  });

}).on('error', function(error) {
  console.error(error);
  wss.clients.forEach(ws => {
    const Disconnect = {
      Text: "RCON Error :(",
      Type: MessageFlags.DoKickOrDisconnect,
      Date: Date.now()
    };
    ws.send(encrypt(JSON.stringify(Disconnect),ws.socketProps.key));
  });

});
rcon.connect();

const queue = []
async function RunQueue() {
  if (queue.length > 0) {
      rcon.once('response', function(str) {
      wss.clients.forEach(ws => {
        if (ws.socketProps.key == queue[0].key){
          const response = {
            Name: "RCON",
            Text: str,
            Type: MessageFlags.ConsoleLogMessage,
            Date: Date.now()
          };
          ws.send(encrypt(JSON.stringify(response),ws.socketProps.key))
        };
      });
    });
    rcon.send(queue[0].command)
    await waitFor('response', rcon);
    queue.shift()
  }
}

setInterval(function () {
  RunQueue();
}, 1000)

console.log("Enabling Query");
const query = new Query(HOST, QUERYPORT, { timeout: 10000 })
var cpuUsage = 0
var players = []
function checkMcServer() {
  // connect every time to get a new challengeToken
  query.connect(function (err) {
    if (err) {
      console.error(err);
    } else {
      query.full_stat(fullStatBack);
    }
  })
}

function fullStatBack(err, stat) {
  if (err) {
    console.error(err);
  }
  wss.clients.forEach(ws => {
    players = stat._player;
    const heartbeat = {
      Type: MessageFlags.HeartbeatMessage,
      Flags: [stat.version, stat.maxplayers, stat.numplayers, os.sysUptime(), cpuUsage, 100-os.freememPercentage()],
      Date: Date.now()
    }
    ws.send(encrypt(JSON.stringify(heartbeat),ws.socketProps.key))
  })
  //console.log('%s>fullBack \n', new Date(), stat)
}

setInterval(function () {
  os.cpuUsage(function(v) {cpuUsage = v})
  checkMcServer();
}, 5000);

console.log("Enabling HTTP Server");
fastify.register(require('fastify-static'), {
  root: path.join(__dirname, '/public'),
  prefix: '/'
});

fastify.decorate('notFound', (request, reply) => {
  reply.code(404).header('Content-Type', 'text/html').type('text/html').send(fs.readFileSync('./public/404.html'));
});
fastify.setNotFoundHandler(fastify.notFound);

fastify.get('/players.json', options, async (req, reply) => {
    reply.send(players)
})

fastify.listen(HTTPPORT, HTTPADDR, function (err, address) {
  if (err) {
    throw err;
  }
  fastify.log.info(`server listening on ${address}`);
})