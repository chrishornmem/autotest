var http = require('http');
var express = require('express');
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

var app = express();

// Bring in the routes for the API (delete the default routes)
var routesApi = require('./app_api/routes/index.js');

// Bring in the data model & connect to db
// require('./app_api/models/db');

// The http server will listen to an appropriate port, or default to
// port 5000.
var theport = process.env.PORT || 5000;

var smppSession; // the smpp session context saved globally.

app.use(logger('dev'));
app.use(methodOverride());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
    secret: 'aut0test',
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 24 * 360000 } // 24 hours
}));

app.use(function(req, res, next) { //allow cross origin requests
    res.setHeader("Access-Control-Allow-Methods", "POST, PUT, OPTIONS, DELETE, GET");
    res.header("Access-Control-Allow-Origin", "http://localhost");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
});


// Use the API routes when path starts with /api
app.use('/api', routesApi);

var smppServer = smpp.createServer(function(session) {

    smppSession = session; // save the session globally

    session.on('bind_transceiver', function(pdu) {
        console.log('Bind request received, system_id:' + pdu.system_id + ' password:' + pdu.password);
        // we pause the session to prevent further incoming pdu events,
        // untill we authorize the session with some async operation.
        session.pause();
        //     checkAsyncUserPass(pdu.system_id, pdu.password, function(err) {
        //         if (err) {
        if (!(pdu.system_id == "autotest" && pdu.password == 'password')) {
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

});
smppServer.listen(2775);


function sendSMS(from, to, text) {
    // in this example, from & to are integers
    // We need to convert them to String
    // and add `+` before

    from = '+' + from.toString();
    to = '+' + to.toString();

    smppSession.submit_sm({
        source_addr: from,
        destination_addr: to,
        short_message: text
    }, function(pdu) {
        console.log('sms pdu status', lookupPDUStatusKey(pdu.command_status));
        if (pdu.command_status == 0) {
            // Message successfully sent
            console.log("message sent:" +pdu.message_id);
        }
    });
}

app.get('/api/getResponse', function(req, res, next) {

    var moText = (typeof req.query.moText !== 'undefined') ? req.query.moText.trim() : 'skip';
    var skip = req.query.skip;

    var body = { response: '', skip: false }; // container for processRequest


    if (moText.length === 0) return res.json({ mtText: undefined });

    sendSMS('447725419720', '333', moText);

    smppSession.on('submit_sm', function(pdu) {
        var msgid = getMsgId(); // generate a message_id for this message.
        console.log("msgid:" + msgid);

        session.send(pdu.response({
            message_id: msgid
        }));

        console.log("message received:" + pdu.short_message);

        res.json({
            mtText: pdu.short_message,
            skip: false
        });

    });

});

app.get('/', function(req, res, next) {
    res.sendFile('/public/views/index.html', { root: __dirname });
});

app.get('*', function(req, res) {
    res.sendFile('/public/views/index.html', { root: __dirname });
});

app.get('/*', function(req, res, next) {
    console.log("caught default route");
    // Just send the index.html for other files to support HTML5Mode
    res.sendFile('/public/views/index.html', { root: __dirname });
});

// error handling middleware should be loaded after the loading the routes
if ('development' == app.get('env')) {
    app.use(errorHandler());
}

function getMsgId(min, max) {
    return Math.floor(Math.random() * 4294967295);
}


var server = http.createServer(app);
server.listen(app.get('port'), function() {
    console.log('Express server listening on port ' + app.get('port'));
});
server.listen(5000);

module.exports = app;