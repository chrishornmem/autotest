const mongoose = require('mongoose');
const ObjectId = require('mongoose').Types.ObjectId;
const common = require('../common/common.js');

var UserSchema = require('../models/Model').UserSchema;
var User = mongoose.model('users', UserSchema);

var MessageSchema = require('../models/Model').MessageSchema;
var Message = mongoose.model('messages', MessageSchema);

exports.save = function(from, to, text) {
    console.log("messages.save");
    console.log("from: " + from + ' to:' + to);
    common.getUser(to).then(function(user) {
        var message = new Message();
        message._user = user._id;
        message.from = from;
        message.to = to;
        message.text = text;
        message.delivered = false;
        return message.save();
    }).catch(function(error) {
        console.log("/message.save");
        console.log(error);
        return new Error(error);
    });
}
