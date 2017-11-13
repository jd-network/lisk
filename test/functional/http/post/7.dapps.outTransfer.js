'use strict';

var node = require('../../../node');
var shared = require('../../shared');
var constants = require('../../../../helpers/constants');

var sendTransactionPromise = require('../../../common/apiHelpers').sendTransactionPromise;
var creditAccountPromise = require('../../../common/apiHelpers').creditAccountPromise;
var waitForConfirmations = require('../../../common/apiHelpers').waitForConfirmations;
var getAccountsPromise = require('../../../common/apiHelpers').getAccountsPromise;

describe('POST /api/transactions (type 7) outTransfer dapp', function () {

	var transaction;
	var transactionsToWaitFor = [];
	var badTransactions = [];
	var goodTransactions = [];

	var account = node.randomAccount();
	var accountMinimalFunds = node.randomAccount();

	// Crediting accounts
	before(function () {
		var promises = [];
		promises.push(creditAccountPromise(account.address, 1000 * node.normalizer));
		promises.push(creditAccountPromise(accountMinimalFunds.address, constants.fees.dappRegistration));

		return node.Promise.all(promises)
			.then(function (results) {
				results.forEach(function (res) {
					node.expect(res).to.have.property('success').to.be.ok;
					node.expect(res).to.have.property('transactionId').that.is.not.empty;
					transactionsToWaitFor.push(res.transactionId);
				});
			})
			.then(function () {
				return waitForConfirmations(transactionsToWaitFor);
			})
			.then(function () {
				transaction = node.lisk.dapp.createDapp(account.password, null, node.guestbookDapp);

				return sendTransactionPromise(transaction);
			})
			.then(function (res) {
				node.expect(res).to.have.property('success').to.ok;
				node.expect(res).to.have.property('transactionId').to.equal(transaction.id);
				node.guestbookDapp.id = res.transactionId;
				transactionsToWaitFor.push(res.transactionId);
			})
			.then(function () {
				transaction = node.lisk.dapp.createDapp(accountMinimalFunds.password, null, node.blockDataDapp);

				return sendTransactionPromise(transaction);
			})
			.then(function (res) {
				node.expect(res).to.have.property('success').to.ok;
				node.expect(res).to.have.property('transactionId').to.equal(transaction.id);
				node.blockDataDapp.id = res.transactionId;
				transactionsToWaitFor.push(res.transactionId);
			})
			.then(function () {
				return waitForConfirmations(transactionsToWaitFor);
			});
	});

	describe('schema validations', function () {

		shared.invalidAssets(account, 'outTransfer', badTransactions);

		describe('dappId', function () {

			it('without should fail', function () {
				transaction = node.lisk.transfer.createOutTransfer(node.guestbookDapp.id, Date.now(), node.gAccount.password);
				delete transaction.asset.inTransfer.dappId;

				return sendTransactionPromise(transaction).then(function (res) {
					node.expect(res).to.have.property('success').to.be.not.ok;
					node.expect(res).to.have.property('message').to.equal('Invalid transaction body - Failed to validate inTransfer schema: Missing required property: dappId');
					badTransactions.push(transaction);
				});
			});

			it('with integer should fail', function () {
				transaction = node.lisk.transfer.createOutTransfer(node.guestbookDapp.id, Date.now(), node.gAccount.password);
				transaction.asset.inTransfer.dappId = 1;

				return sendTransactionPromise(transaction).then(function (res) {
					node.expect(res).to.have.property('success').to.be.not.ok;
					node.expect(res).to.have.property('message').to.equal('Invalid transaction body - Failed to validate inTransfer schema: Expected type string but found type integer');
					badTransactions.push(transaction);
				});
			});

			it('with number should fail', function () {
				transaction = node.lisk.transfer.createOutTransfer(node.guestbookDapp.id, Date.now(), node.gAccount.password);
				transaction.asset.inTransfer.dappId = 1.2;

				return sendTransactionPromise(transaction).then(function (res) {
					node.expect(res).to.have.property('success').to.be.not.ok;
					node.expect(res).to.have.property('message').to.equal('Invalid transaction body - Failed to validate inTransfer schema: Expected type string but found type number');
					badTransactions.push(transaction);
				});
			});

			it('with empty array should fail', function () {
				transaction = node.lisk.transfer.createOutTransfer(node.guestbookDapp.id, Date.now(), node.gAccount.password);
				transaction.asset.inTransfer.dappId = [];

				return sendTransactionPromise(transaction).then(function (res) {
					node.expect(res).to.have.property('success').to.be.not.ok;
					node.expect(res).to.have.property('message').to.equal('Invalid transaction body - Failed to validate inTransfer schema: Expected type string but found type array');
					badTransactions.push(transaction);
				});
			});

			it('with empty object should fail', function () {
				transaction = node.lisk.transfer.createOutTransfer(node.guestbookDapp.id, Date.now(), node.gAccount.password);
				transaction.asset.inTransfer.dappId = {};

				return sendTransactionPromise(transaction).then(function (res) {
					node.expect(res).to.have.property('success').to.be.not.ok;
					node.expect(res).to.have.property('message').to.equal('Invalid transaction body - Failed to validate inTransfer schema: Expected type string but found type object');
					badTransactions.push(transaction);
				});
			});

			it('invalid dapp id should fail', function () {
				var invalidDappId = '1L';
				transaction = node.lisk.transfer.createOutTransfer(invalidDappId, 1, node.gAccount.password);

				return sendTransactionPromise(transaction).then(function (res) {
					node.expect(res).to.have.property('success').to.be.not.ok;
					node.expect(res).to.have.property('message').to.equal('Invalid transaction body - Failed to validate inTransfer schema: Object didn\'t pass validation for format id: ' + invalidDappId);
					badTransactions.push(transaction);
				});
			});
		});

		describe('amount', function () {

			it('using < 0 should fail', function () {
				transaction = node.lisk.transfer.createOutTransfer(node.guestbookDapp.id, -1, node.gAccount.password);

				return sendTransactionPromise(transaction).then(function (res) {
					node.expect(res).to.have.property('success').to.be.not.ok;
					node.expect(res).to.have.property('message').to.equal('Invalid transaction body - Failed to validate transaction schema: Value -1 is less than minimum 0');
					badTransactions.push(transaction);
				});
			});

			it('using > balance should fail', function () {
				var params = [
					'address=' + account.address
				];

				return getAccountsPromise(params)
					.then(function (res) {
						node.expect(res.body).to.have.nested.property('accounts').to.have.lengthOf(1);

						var balance = res.body.accounts[0].balance;
						var amount = new node.bignum(balance).plus('1').toNumber();
						transaction = node.lisk.transfer.createOutTransfer(node.guestbookDapp.id, amount, account.password);

						return sendTransactionPromise(transaction);
					})
					.then(function (res) {
						node.expect(res).to.have.property('success').to.be.not.ok;
						node.expect(res).to.have.property('message').to.match(/^Account does not have enough LSK: /);
						badTransactions.push(transaction);
					});
			});
		});
	});

	describe('transactions processing', function () {

		it('invented dapp id should fail', function () {
			var inventedDappId = '1';
			transaction = node.lisk.transfer.createOutTransfer(inventedDappId, 1, node.gAccount.password);

			return sendTransactionPromise(transaction).then(function (res) {
				node.expect(res).to.have.property('success').to.be.not.ok;
				node.expect(res).to.have.property('message').to.equal('Application not found: ' + inventedDappId);
				badTransactions.push(transaction);
			});
		});

		it('using unrelated transaction id as dapp id should fail', function () {
			transaction = node.lisk.transfer.createOutTransfer(transactionsToWaitFor[0], 1, node.gAccount.password);

			return sendTransactionPromise(transaction).then(function (res) {
				node.expect(res).to.have.property('success').to.be.not.ok;
				node.expect(res).to.have.property('message').to.equal('Application not found: ' + transactionsToWaitFor[0]);
				badTransactions.push(transaction);
			});
		});

		it('with correct data should be ok', function () {
			transaction = node.lisk.transfer.createOutTransfer(node.guestbookDapp.id, 10 * node.normalizer, node.gAccount.password);

			return sendTransactionPromise(transaction).then(function (res) {
				node.expect(res).to.have.property('success').to.be.ok;
				node.expect(res).to.have.property('transactionId').to.equal(transaction.id);
				goodTransactions.push(transaction);
			});
		});

		describe('from the author itself', function () {

			it('with minimal funds should fail', function () {
				transaction = node.lisk.transfer.createOutTransfer(node.blockDataDapp.id, 1, accountMinimalFunds.password);

				return sendTransactionPromise(transaction).then(function (res) {
					node.expect(res).to.have.property('success').to.be.not.ok;
					node.expect(res).to.have.property('message').to.match(/^Account does not have enough LSK: /);
					badTransactions.push(transaction);
				});
			});

			it('with enough funds should be ok', function () {
				transaction = node.lisk.transfer.createOutTransfer(node.guestbookDapp.id, 10 * node.normalizer, account.password);

				return sendTransactionPromise(transaction).then(function (res) {
					node.expect(res).to.have.property('success').to.be.ok;
					node.expect(res).to.have.property('transactionId').to.equal(transaction.id);
					goodTransactions.push(transaction);
				});
			});
		});
	});

	describe('confirmation', function () {

		shared.confirmationPhase(goodTransactions, badTransactions);
	});
});
