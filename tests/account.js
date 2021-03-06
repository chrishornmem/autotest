describe('Suite 2 - onem test suite', function() {

    var re; // for RegExp expressions

    browser.get('http://172.16.38.98:5000');

    it('2.2.1 - should execute the #account mid', function() {

        element(by.id('sms')).sendKeys('#account');
        element(by.id('sms')).sendKeys(protractor.Key.ENTER).then(function() {
            element.all(by.repeater('obj in results')).then(function(mt) {
                var message = mt[mt.length - 1].element(by.className('sms-mt-container'));
                expect(message.getText()).toEqual(
                    '** Account menu **\n' +
                    'a mID\n' +
                    'b Subscription\n' +
                    'c Settings\n' +
                    'd Tutorial\n' +
                    '<send option>'
                );
            });
        });

        re = new RegExp(
            "\\*\\* Account menu \\*\\*\n" +
            "default: " + browser.params.mid + "\n" +
            "a mID\n" +
            "b Subscription\n" +
            "c Settings\n" +
            "d Tutorial\n" +
            "<send option>");

        element(by.id('sms')).sendKeys('a');
        element(by.id('sms')).sendKeys(protractor.Key.ENTER).then(function() {
            element.all(by.repeater('obj in results')).then(function(mt) {
                var message = mt[mt.length - 1].element(by.className('sms-mt-container'));
                expect(message.getText()).toMatch(re);
            });
        });

    });

    it('2.2.2.1 - #account - should execute the #account subscription', function() {

        re = new RegExp(
            "\\*\\* Account menu \\*\\*\n" +
            "Tier: " + browser.params.words + "\n" +
            "Cost: Free\n" +
            "a mID\n" +
            "b Subscription\n" +
            "c Settings\n" +
            "d Tutorial\n" +
            "<send option>");

        element(by.id('sms')).sendKeys('b');
        element(by.id('sms')).sendKeys(protractor.Key.ENTER).then(function() {
            element.all(by.repeater('obj in results')).then(function(mt) {
                var message = mt[mt.length - 1].element(by.className('sms-mt-container'));
                expect(message.getText()).toMatch(re);
            });
        });

    });

    it('2.2.3.1 - #account - should set the account full name', function() {

        re = new RegExp(
            "\\*\\* Account settings \\*\\*\n" +
            "a Full name: not set\n" +
            "b ONEm name: " + browser.params.onemName + "\n" +
            "c Language: " + browser.params.words + "\n" +
            "d Location: " + browser.params.words + "\n" +
            "<send option/\"back\">");

        element(by.id('sms')).sendKeys('c');
        element(by.id('sms')).sendKeys(protractor.Key.ENTER).then(function() {
            element.all(by.repeater('obj in results')).then(function(mt) {
                var message = mt[mt.length - 1].element(by.className('sms-mt-container'));
                expect(message.getText()).toMatch(re);
            });
        });

        element(by.id('sms')).sendKeys('a');
        element(by.id('sms')).sendKeys(protractor.Key.ENTER).then(function() {
            element.all(by.repeater('obj in results')).then(function(mt) {
                var message = mt[mt.length - 1].element(by.className('sms-mt-container'));
                expect(message.getText()).toEqual(
                    "** Account full name **\n" +
                    "This information is used for your account setup and recovery\n" +
                    "Send first name"
                );

            });
        });

        element(by.id('sms')).sendKeys('Chris');
        element(by.id('sms')).sendKeys(protractor.Key.ENTER).then(function() {
            element.all(by.repeater('obj in results')).then(function(mt) {
                var message = mt[mt.length - 1].element(by.className('sms-mt-container'));
                expect(message.getText()).toEqual(
                    "** Account full name **\n" +
                    "Send last name"
                );

            });
        });

        element(by.id('sms')).sendKeys('Horn');
        element(by.id('sms')).sendKeys(protractor.Key.ENTER).then(function() {
            element.all(by.repeater('obj in results')).then(function(mt) {
                var message = mt[mt.length - 1].element(by.className('sms-mt-container'));
                expect(message.getText()).toEqual(
                    "** Account full name **\n" +
                    "a Confirm\n" +
                    "b Back\n" +
                    "You selected:\n" +
                    "c Chris\n" +
                    "d Horn\n" +
                    "<send option>"
                );
            });
        });

        
    });
});