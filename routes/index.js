var express = require('express');
var router = express.Router();
var base64 = require('base-64');
var request = require('request');
var async = require('async');
var mongo = require('mongodb');

var conf = require('../conf.json');

var svurl = "mongodb://localhost:27017";

var apiSec = conf.esiSecrete;
var apiID = conf.esiClientID;

function callback(error, response, body) {
    if (!error && response.statusCode == 200) {
        console.log(body);
    }
}

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', { title: 'Chat Notifications Login', message: 'Add your character here:' });
});

router.get('/added', function(req, res, next) {
	res.render('index', { title: 'Chat Notifications Login', message: 'Character added!!!' });
});

router.get('/error', function(req, res, next) {
	res.render('index', { title: 'Chat Notifications Login', message: 'Something went wrong! Try again!' });
});

router.get('/SSO/CallBack', function(req, res, next) {
	let data = req.query;

	if(data.state === "zmesi"){ //check for valid unique request code
		var DBData = {}; //var to store data to be saved to the DB		
		var authCode = data.code;
		var decoded = apiID + ":" + authCode;
		var encoded = base64.encode(decoded);
		DBData.base64 = encoded;
		//build request for access token
		var header = {
			'Authorization': "Basic " + encoded,
			'Content-Type': 'application/json'
		}
		var postBody = {
			"grant_type":"authorization_code",
			"code": authCode 
		}
		var postBodyString = JSON.stringify(postBody);
		var opt = {
			url: 'https://login.eveonline.com/oauth/token',
			method: 'POST',
			headers: header,
			body: postBodyString,
			auth: {
				'user': apiID,
				'pass': apiSec
			}
		}
		// end build request for access token
		request(opt, function(err, resp, body){// make the request for the access token
			if (!err) {//no error
				var respData = JSON.parse(body);
				DBData.access_token = respData.access_token;
				DBData.refresh_token = respData.refresh_token;
				//build request for character ID
				var authz = "Bearer " + DBData.access_token;
				var header1 = {
					'Authorization': authz
				}
				var opt1 = {
					url: 'https://login.eveonline.com/oauth/verify',
					headers: header1
				}
				//end build character id req
				request(opt1, function(err1, resp1,body1){
					if(!err1){//got id, no error
						var respData1 = JSON.parse(body1);
						DBData._id = respData1.CharacterID;
						DBData.name = respData1.CharacterName;
						// got character id & all the tokens
						//time to make a notifications request
						//build notification request
						var header2 = {
							'accept': 'application/json'
						}
						var opt2 = {
							url: 'https://esi.tech.ccp.is/latest/characters/' + DBData._id + '/notifications/?datasource=tranquility&token=' + DBData.access_token,
							headers: header2
						}
						//req built, time to make the request
						request(opt2, function(err2, resp2,body2){
							if(!err2){//got reply, no error
								var respData2 = JSON.parse(body2);
								var utime = new Date(respData2[0].timestamp).getTime();
								DBData.last_notf = utime;
								//db obj now built!
								//time to save it
								mongo.connect(svurl, function(err, client) {
									if (err) {
										console.log(err);
									} else {
										var db = client.db('chat-notify');
										console.log(DBData);
										db.collection('data').insertOne(DBData, function(err, result) {
											console.log("Saved!!!");
											client.close();
										});
									}
								});
							}else{//error on notification
								res.redirect(302, '/error');
							}
						});
					}else{//error on getting char id
						res.redirect(302, '/error');
					}
				});
			}else{//error on getting access token
				res.redirect(302, '/error');
			}
		});
	}else{//not my unique id thingy
		res.redirect(302, '/error');
	}
	res.redirect(302, '/added');
  });

module.exports = router;
