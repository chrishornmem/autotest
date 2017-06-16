var express = require('express');
var app = require('express')();
var server = require('http').createServer(app);
var io = require('socket.io')(server);
var logger = require('morgan');
var path = require('path');
var favicon = require('serve-favicon');
var methodOverride = require('method-override');
var session = require('express-session');
var bodyParser = require('body-parser');
var errorHandler = require('errorhandler');
var request = require('request');
var fs = require('fs');
var moment = require('moment');
var _ = require('underscore-node');
var smpp = require('smpp');
var FileStore = require('session-file-store')(session);
// var sharedsession = require("express-socket.io-session");

require('dotenv').load();

// Bring in the routes for the API (delete the default routes)
var routesApi = require('./app_api/routes/index.js');

// Bring in the data model & connect to db
// require('./app_api/models/db');

// The http server will listen to an appropriate port, or default to
// port 5000.
var theport = process.env.PORT || 5000;
var username = process.env.USERNAME; // used for web basic auth
var password = process.env.PASSWORD; // used for web basic auth
var smppSystemId = process.env.SMPP_SYSTEMID || "autotest";
var smppPassword = process.env.SMPP_PASSWORD || "password";
var smppPort = process.env.SMPP_PORT || 2775;

var smppSession; // the smpp session context saved globally.
var resArray = [];
var clients = [];

app.use(logger('dev'));
app.use(methodOverride());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, 'public')));

// JsSIP is not designed to use "express" library. To be loaded we need its path:
app.use(express.static(path.join(__dirname, 'node_modules/jssip/dist')));

var express_middleware = session({
    secret: 'aut0test',
    resave: true,
    store: new FileStore,
    saveUninitialized: true,
    cookie: { maxAge: 365 * 4 * 24 * 60 * 60 * 1000 } // 4 years
});

app.use(express_middleware);

//Use of Express-Session as Middleware    
io.use(function(socket, next) {
    express_middleware(socket.handshake, {}, next);
});

app.use(function(req, res, next) { //allow cross origin requests
    res.setHeader("Access-Control-Allow-Methods", "POST, PUT, OPTIONS, DELETE, GET");
    res.header("Access-Control-Allow-Origin", "http://localhost");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
});


// Use the API routes when path starts with /api
app.use('/api', routesApi);

var smppServer = smpp.createServer(function(session) {

    // var alreadySent = false;
    var mtText = '';
    var i, resObj;

    smppSession = session; // save the session globally

    session.on('bind_transceiver', function(pdu) {
        console.log('Bind request received, system_id:' + pdu.system_id + ' password:' + pdu.password);
        // we pause the session to prevent further incoming pdu events,
        // untill we authorize the session with some async operation.
        session.pause();
        //     checkAsyncUserPass(pdu.system_id, pdu.password, function(err) {
        //         if (err) {
        if (!(pdu.system_id == smppSystemId && pdu.password == smppPassword)) {
            session.send(pdu.response({
                command_status: smpp.ESME_RBINDFAIL
            }));
            console.log('Error binding');
            session.close();
            return;
        }
        console.log('Successfully bound');
        session.send(pdu.response());
        session.resume();
    });

    session.on('enquire_link', function(pdu) {
        console.log('enquire_link received');
        session.send(pdu.response());
    });

    session.on('unbind', function(pdu) {
        console.log('unbind received, closing session');
        session.send(pdu.response());
        session.close();
    });

    smppSession.on('submit_sm', function(pdu) {

        var clientFound = false;

        console.log("submit_sm received, sequence_number:" + pdu.sequence_number + " isResponse:" + pdu.isResponse());

        smppSession.send(pdu.response());

        if (pdu.short_message.length === 0) {
            console.log("** payload being used **");
            mtText = pdu.message_payload;
        } else {
            mtText = pdu.short_message.message;
        }

        console.log("mtText:" + mtText);

        console.log("more messages:" + pdu.more_messages_to_send);

        // retrieve the session information based on the msisdn
        for (var i = 0; i < clients.length; i++) {
            if (typeof clients[i].moRecord !== 'undefined' && clients[i].moRecord.msisdn === pdu.destination_addr) {
                clients[i].moRecord.messageWaiting = true;
                clients[i].moRecord.mtText = clients[i].moRecord.mtText + mtText;
                clientFound = true;
                console.log("client found");
            }
        }

        // if the session is found but there are more messages to come, then concatenate the message and stop (wait for final message before sending)
        if (clientFound && pdu.more_messages_to_send === 1) {
            console.log("more mesages to send, so returning");
            return;
        }

        // if this is the last message in the sequence, we can:
        //   1) delete the session
        //   2) retrieve the saved/concatenated message string
        //   3) reset the message string to blank
        //   4) send the result back to the client using the saved session
        if (clientFound && (pdu.more_messages_to_send === 0 ||
                typeof pdu.more_messages_to_send === 'undefined')) {
            console.log("clientfound and no more messages");
            console.log("clients.length:" + clients.length);
            for (i = 0; i < clients.length; i++) {
                if (typeof clients[i].moRecord !== 'undefined' && clients[i].moRecord.messageWaiting) {
                    try {
                        console.log("trying response: " + clients[i].moRecord.mtText);
                        clients[i].moRecord.messageWaiting = false;
                        clients[i].moRecord.socket.emit('MT SMS', { mtText: clients[i].moRecord.mtText });
                        clients[i].moRecord.mtText = '';
                    } catch (err) {
                        console.log("oops no session:" + err);
                    }
                }
            }
        }

    });

    smppSession.on('deliver_sm', function(pdu) {
        console.log("deliver_sm received" + pdu);
        if (pdu.esm_class == 4) {
            var shortMessage = pdu.short_message;
            console.log('Received DR: %s', shortMessage.trim());
            smppSession.send(pdu.response());
        }
    });

});

function sendSMS(from, to, text) {

    var buffer = new Buffer(2 * text.length);
    for (var i = 0; i < text.length; i++) {
        buffer.writeUInt16BE(text.charCodeAt(i), 2 * i);
    }

    if (smppSession) {
        smppSession.deliver_sm({
            source_addr: from,
            source_addr_ton: 1,
            source_addr_npi: 0,
            destination_addr: to,
            destination_addr_ton: 1,
            destination_addr_npi: 0,
            data_coding: 8,
            short_message: buffer
        }, function(pdu) {
            //    console.log('sms pdu status', lookupPDUStatusKey(pdu.command_status));
            if (pdu.command_status === 0) {
                // Message successfully sent
                console.log("message sent:");
            }
        });
    }
}

io.on('connection', function(socket) {

    console.log("connection received");
    clients.push(socket);

    socket.emit(socket.handshake.session);

    if (!socket.handshake.session.onemContext) { // must be first time, or expired
        var msisdn = moment().format('YYMMDDHHMMSS');
        console.log("msisdn:" + msisdn);
        socket.handshake.session.onemContext = { msisdn: msisdn };
        socket.handshake.session.save();
    }

    socket.on('MO SMS', function(moText) {
        console.log('moText: ');
        console.log(moText);

        var moRecord = {
            msisdn: socket.handshake.session.onemContext.msisdn,
            socket: socket,
            mtText: '',
            messageWaiting: false
        };

        var i = clients.indexOf(socket);
        clients[i].moRecord = moRecord;

        console.log("sending SMS");
        sendSMS(socket.handshake.session.onemContext.msisdn, '444100', moText);

    });

    socket.on('disconnect', function() {
        console.info('Client gone (id=' + socket.id + ').');
        var index = clients.indexOf(socket);
        clients.splice(index, 1);
    });

});

app.get('/api/start', function(req, res, next) {

    // if first time (no session) then generate a virtual MSISDN using current timestamp, which is saved in session cookie
    if (!req.session.onemContext) { // must be first time, or expired
        var msisdn = moment().format('YYMMDDHHMMSS');
        console.log("msisdn:" + msisdn);

        req.session.onemContext = { msisdn: msisdn };
    }

    res.json({ msisdn: req.session.onemContext.msisdn });

});

// app.get('/', function(req, res, next) {
//     res.sendFile('/public/views/index.html', { root: __dirname });
// });

// app.get('*', function(req, res) {
//     res.sendFile('/public/views/index.html', { root: __dirname });
// });

app.get('/*', function(req, res, next) {
    console.log("caught default route");
    // Just send the index.html for other files to support HTML5Mode
    res.sendFile('/public/views/index.html', { root: __dirname });
});

// error handling middleware should be loaded after the loading the routes
if ('development' == app.get('env')) {
    app.use(errorHandler());
}

smppServer.listen(smppPort);
server.listen(theport);
//io.listen(http);

module.exports = app;