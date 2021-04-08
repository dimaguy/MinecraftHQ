# MinecraftHQ
## Features
- Online Dashboard with fancy graphs (~~Stolen from [ImpostorHQ](https://github.com/dimaguy/ImpostorHQ/)~~)
- Web Socket and HTTP API
- Encryption in communications, powered by a custom flavour of [TEA](https://en.wikipedia.org/wiki/Tiny_Encryption_Algorithm) (to compensate for lack of SSL by default)
- API Key system, so there is no need to leak the RCON password to every staff member.
## Installation
### Requirements
- A minecraft server with RCON and query enabled
- Some knowledge of basic networking
- Node.js (Written and "tested" with v12.21.0)
### Instructions
1. git clone or download as zip
2. ```yarn install```
3. ```node index.js```
4. Modify the now generated configuration file to suit your purposes
5. ```node index.js``` (again)
6. Use the http address and port on the configuration file to access your dashboard
7. Use one of the api keys set in the file to login (do not use the rcon password)
