var common = require('../common/common.js');
var sms = require('../common/sms.js');

var sio = require('socket.io');
var io = null;

exports.io = function () {
  return io;
};

exports.initialize = function(server, express_middleware, handshake) {

    io = sio(server);
    
    io.use(function(socket, next) {
        express_middleware(socket.handshake, {}, next);
    });

    io.use(function(socket, next){
        if (socket.handshake.query && socket.handshake.query.token){
            console.log("query.token:")
            console.log(socket.handshake.query.token);
            var user;
            var payload = common.decodeJWT(socket.handshake.query.token);
            if (!payload) {
                console.log("invalid jwt");
                next(new Error('Authentication error'));       
            }
            socket.jwtPayload = payload;

            common.getUser(payload.sub).then(function(user) {
                socket.msisdn = user.msisdn;
                next();
            }).catch(function(error) {
                console.log(error);
                console.log("user not found!!");
                return next(new Error('User not found'));
            });
            //console.log("payload");
            //console.log(payload);
        } else {
            console.log("missing jwt");
            next(new Error('Authentication error'));
        }    
    }).on('connection', function(socket) {

        console.log("Connection received!");
        sms.clients.push(socket);    

        socket.on('MO SMS', function(moText) {
            console.log('moText: ');
            console.log(moText);

            console.log("socket.id");
            console.log(socket.id);

            //console.log("socket");
            //console.log(socket);

            //socket.to(socket.handshake.session).emit('MT SMS', { mtText: 'test response'});
            io.to(socket.id).emit('MT SMS', { mtText: 'test response'});
            io.of('/').to(socket.id).emit('MT SMS', { mtText: 'test response'});
            //socket.emit('MT SMS', { mtText: 'test response'});


            var moRecord = {
                msisdn: socket.handshake.session.onemContext.msisdn,
                socket: socket,
                mtText: '',
                messageWaiting: false
            };

            var i = sms.clients.indexOf(socket);
            sms.clients[i].moRecord = moRecord;

            console.log("sending SMS to Short Number " + common.shortNumber);
            // sendSMS(socket.handshake.session.onemContext.msisdn, '444100', moText);
            sms.sendSMS(socket.msisdn, common.shortNumber, moText);

        });

        socket.on('disconnect', function() {
            console.log('Client gone (id=' + socket.id + ').');
            var index = sms.clients.indexOf(socket);
            sms.clients.splice(index, 1);
        });

    });
}