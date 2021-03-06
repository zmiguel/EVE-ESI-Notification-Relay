var express = require('express');
var path = require('path');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var base64 = require('base-64');
var request = require('request');
var cron = require('node-cron');
var async = require('async');
var mongo = require('mongodb');
var conf = require('./conf.json');
const Discord = require("discord.js");
const hook = new Discord.WebhookClient(conf.discordHookID,conf.discordHookToken);

var systems = require('./systems.json');

var svurl = "mongodb://localhost:27017";
var strcurl = "https://stop.hammerti.me.uk/api/citadel/";
var counter = 0;

cron.schedule('* * * * *', function() {
	console.log("RUNNING!!!");
    setTimeout(searchNotifications,5000);
});

updateAccess("all");
cron.schedule('*/20 * * * *', function() {
	console.log("UPDATING TOKENS!!!");
    updateAccess("all");
});

var index = require('./routes/index');

var app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'hbs');

// uncomment after placing your favicon in /public
//app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', index);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  var err = new Error('Not Found');
  err.status = 404;
  next(err);
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

module.exports = app;

//actuall app stuff

function isEmpty(obj) {
    for(var key in obj) {
        if(obj.hasOwnProperty(key))
            return false;
    }
    return true;
}

var fuels = [
	{
        "TypeID": 4051,
        "NAME": "Nitrogen Fuel Block"
    },
    {
        "TypeID": 4246,
        "NAME": "Hydrogen Fuel Block"
    },
    {
        "TypeID": 4247,
        "NAME": "Helium Fuel Block"
    },
    {
        "TypeID": 4312,
        "NAME": "Oxygen Fuel Block"
    }
]

function getFuelName(id) {
    for (let i = 0; i < fuels.length; i++) {
        if (fuels[i].TypeID === id) {
            return fuels[i].NAME;
        }
    }
}

function getSystemName(id) {
    for (let i = 0; i < systems.length; i++) {
        if (systems[i].solarSystemID === id) {
            return systems[i].solarSystemName;
        }
    }
}

function updateAccess(id){
	if(id==="all"){
		console.log("updating access for all");
		mongo.connect(svurl, function(err, client) {
			if (err) {
				console.log(err);
			} else {
				var db = client.db('chat-notify');
				//get array of all objs
				db.collection('data').find().toArray(function(err, res) {
					for(let i=0;i<res.length;i++){
						let reslt = res[i];
						//got character object
						//build request of new access token
						var header = {
							'Authorization': reslt.base64,
							'Content-Type': 'application/json'
						}
						var postBody = {
							"grant_type":"refresh_token",
							"refresh_token": reslt.refresh_token 
						}
						var postBodyString = JSON.stringify(postBody);
						var opt = {
							url: 'https://login.eveonline.com/oauth/token',
							method: 'POST',
							headers: header,
							body: postBodyString,
							auth: {
								'user': conf.esiClientID,
								'pass': conf.esiSecrete
							}
						}
						request(opt, function(err, resp, body){// make the request for the access token
							if (!err) {//no error
								var respData = JSON.parse(body);
								mongo.connect(svurl, function(err, client) {
									if (err) {
										console.log(err);
									} else {
										var db = client.db('chat-notify');
										db.collection('data').updateOne({"_id":reslt._id},{$set:{access_token : respData.access_token}});
									}
									client.close();
								});
							}else{
								console.log(err);
							}
						});
					}
				});
			}
		});
	}else{
		console.log("updating access for id " + id);
		mongo.connect(svurl, function(err, client) {
			if (err) {
				console.log(err);
			} else {
				var db = client.db('chat-notify');
				db.collection('data').find({"_id":id}).toArray(function(err, res) {
					let reslt = res[0];
					//got character object
					//build request of new access token
					var header = {
						'Authorization': reslt.base64,
						'Content-Type': 'application/json'
					}
					var postBody = {
						"grant_type":"refresh_token",
						"refresh_token": reslt.refresh_token 
					}
					var postBodyString = JSON.stringify(postBody);
					var opt = {
						url: 'https://login.eveonline.com/oauth/token',
						method: 'POST',
						headers: header,
						body: postBodyString,
						auth: {
							'user': conf.esiClientID,
							'pass': conf.esiSecrete
						}
					}
					request(opt, function(err, resp, body){// make the request for the access token
						if (!err) {//no error
							var respData = JSON.parse(body);
							mongo.connect(svurl, function(err, client) {
								if (err) {
									console.log(err);
								} else {
									var db = client.db('chat-notify');
									db.collection('data').updateOne({"_id":id},{$set:{access_token : respData.access_token}});
								}
								client.close();
							});
						}else{
							console.log(err);
						}
					});
				});
			}
		});
	}
}

function searchNotifications(){
	mongo.connect(svurl, function(err, client) {
		if (err) {
			console.log(err);
		} else {
			var db = client.db('chat-notify');
			db.collection('data').find().toArray(function(err, res) {
				//find current id to use
				if(counter >= res.length){
					counter = 0;
				}
				//set current to that id
				var currentData = res[counter];
				//build request for notifications
				var header = {
					'accept': 'application/json'
				}
				var opt = {
					url: 'https://esi.tech.ccp.is/latest/characters/' + currentData._id + '/notifications/?datasource=tranquility&token=' + currentData.access_token,
					headers: header
				}
				//req built, time to make the request
				request(opt, function(err, resp, body){
					if(!err){//got reply, no error
						var rnot = JSON.parse(body);
						var newMaxNotify = new Date(rnot[0].timestamp).getTime();
						for(let i=0;i<rnot.length;i++){
							let cur = rnot[i];
							let curUT = new Date(cur.timestamp).getTime();
							if(curUT <= currentData.last_notf){
								//update last notfication here
								db.collection('data').updateMany({},{$set:{last_notf : newMaxNotify}});
								break;
							}else{
								if(cur.type === "StructureFuelAlert"){
									var str = cur.text.split("\n");
									var opt2 = {
										url: strcurl + parseInt(str[4].split(" ")[2])
									}
									request(opt2, function(err, resp, body2){
										if(!err){//got reply, no error
											var rnot1 = JSON.parse(body2);
											var citadel;
											if(isEmpty(rnot1[parseInt(str[4].split(" ")[2])])){
												citadel = "-";
											}else{
												citadel = rnot1[parseInt(str[4].split(" ")[2])].name;
											}
											var out = "Citadel **" + citadel + "** in **" + getSystemName(parseInt(str[3].split(" ")[1])) + "** is low on fuel!!!";
											const embed = new Discord.RichEmbed()
												.setAuthor("CITADEL LOW ON FUEL")
												.setColor(0xFF0000)
												.setDescription(out)
												.setFooter("Made by Oxed G", "https://image.eveonline.com/Character/95339706_256.jpg")
												.setThumbnail("https://cdn3.iconfinder.com/data/icons/picons-weather/57/53_warning-512.png")
												.setTimestamp(cur.timestamp);

											hook.send("@everyone",embed);
											counter++;
										}
									});
								}
								if(cur.type === "StructureAnchoring"){
									var str = cur.text.split("\n");
									var out = str[4].split(":")[1] + " is anchoring a citadel in **" + getSystemName(parseInt(str[5].split(" ")[1])) + "**";
									const embed = new Discord.RichEmbed()
										.setAuthor("CITADEL ANCHROING")
										.setColor(0x0088FF)
										.setDescription(out)
										.setFooter("Made by Oxed G", "https://image.eveonline.com/Character/95339706_256.jpg")
										.setThumbnail("https://cdn2.iconfinder.com/data/icons/perfect-flat-icons-2/512/Info_information_user_about_card_button_symbol.png")
										.setTimestamp(cur.timestamp);

									hook.send("@everyone",embed);
									counter++;
								}
								if(cur.type === "StructureOnline"){
									var str = cur.text.split("\n");
									var out = "Citadel in **" + getSystemName(parseInt(str[0].split(" ")[1])) + "** is now Online!";
									const embed = new Discord.RichEmbed()
										.setAuthor("CITADEL NOW ONLINE")
										.setColor(0x00FF00)
										.setDescription(out)
										.setFooter("Made by Oxed G", "https://image.eveonline.com/Character/95339706_256.jpg")
										.setThumbnail("https://cdn0.iconfinder.com/data/icons/social-messaging-ui-color-shapes/128/check-circle-green-512.png")
										.setTimestamp(cur.timestamp);

									hook.send("@everyone",embed);
									counter++;
								}
								if(cur.type === "TowerResourceAlertMsg"){
									var str = cur.text.split("\n");
									var fuelName = getFuelName(parseInt(str[7].split(" ")[3]));
									var opt2 = {
										url: "https://esi.tech.ccp.is/latest/universe/moons/" + parseInt(str[2].split(" ")[1])
									}
									request(opt2, function(err, resp, body2){
										if(!err){//got reply, no error
											var rnot1 = JSON.parse(body2);
											var moon = rnot1.name;
											var out = "Starbase at **" + moon + "** is low on **" + fuelName + "s!!!**";
											const embed = new Discord.RichEmbed()
												.setAuthor("STARBASE LOW ON FUEL")
												.setColor(0xFF0000)
												.setDescription(out)
												.setFooter("Made by Oxed G", "https://image.eveonline.com/Character/95339706_256.jpg")
												.setThumbnail("https://cdn3.iconfinder.com/data/icons/picons-weather/57/53_warning-512.png")
												.setTimestamp(cur.timestamp);

											hook.send("@everyone",embed);
											counter++;
										}
									});
								}
								if(cur.type === "StructureUnderAttack"){
									var str = cur.text.split("\n");
									var opt2 = {
										url: strcurl + parseInt(str[16].split(" ")[2])
									}
									request(opt2, function(err, resp, body2){
										if(!err){//got reply, no error
											var rnot1 = JSON.parse(body2);
											var citadel;
											if(isEmpty(rnot1[parseInt(str[16].split(" ")[2])])){
												citadel = "-";
											}else{
												citadel = rnot1[parseInt(str[16].split(" ")[2])].name;
											}
											
											//get pilots name
											var opt3 = {
												url: "https://esi.tech.ccp.is/latest/characters/" + parseInt(str[7].split(" ")[1])
											}
											request(opt3, function(err, resp, body3){
												if(!err){//got reply, no error
													var rnot2 = JSON.parse(body3);
													var pname = rnot2.name;
													var pcorpid = rnot2.corporation_id;
													var pallyid = rnot2.alliance_id;
													//get corp name
													var opt4 = {
														url: "https://esi.tech.ccp.is/latest/corporations/" + pcorpid
													}
													request(opt4, function(err, resp, body4){
														if(!err){//got reply, no error
															var rnot3 = JSON.parse(body4);
															var pcorp = rnot3.name;
															//get alliance name
															var opt5 = {
																url: "https://esi.tech.ccp.is/latest/alliances/" + pallyid
															}
															request(opt5, function(err, resp, body4){
																if(!err){//got reply, no error
																	var rnot4 = JSON.parse(body4);
																	var pally = rnot4.name;
																	
																	var out = "Citadel **" + citadel + "** in **" + getSystemName(parseInt(str[15].split(" ")[1])) + "** is under attack by **" + pname + "** from **(" + pcorp + ")[" + pally + "]**";
																	const embed = new Discord.RichEmbed()
																		.setAuthor("CITADEL UNDER ATTACK")
																		.setColor(0xFF0000)
																		.setDescription(out)
																		.setFooter("Made by Oxed G", "https://image.eveonline.com/Character/95339706_256.jpg")
																		.setThumbnail("https://cdn3.iconfinder.com/data/icons/picons-weather/57/53_warning-512.png")
																		.addField("Shield", str[14].split(" ")[1], true)
																		.addField("Armour", str[6].split(" ")[1], true)
																		.addField("Hull", str[13].split(" ")[1], true)
																		.setTimestamp(cur.timestamp);

																	hook.send("@everyone",embed);
																	counter++;
																}
															});
														}
													});
												}
											});
										}
									});
								}
								if(cur.type === "StructureServicesOffline"){
									var str = cur.text.split("\n");
									var out = "Citadel in **" + getSystemName(parseInt(str[4].split(" ")[1])) + "**  is out of fuel!!!";
									const embed = new Discord.RichEmbed()
										.setAuthor("CITADEL OUT OF FUEL")
										.setColor(0xFF0000)
										.setDescription(out)
										.setFooter("Made by Oxed G", "https://image.eveonline.com/Character/95339706_256.jpg")
										.setThumbnail("https://cdn3.iconfinder.com/data/icons/picons-weather/57/53_warning-512.png")
										.setTimestamp(cur.timestamp);

									hook.send("@everyone",embed);
									counter++;
								}
							}
						}
					}
				});
			});
		}
	});
}
