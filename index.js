var google = require('googleapis'),
	OAuth2 = google.auth.OAuth2,
	calendar = google.calendar("v3"),
	open = require('open'),
	http = require("http"),
	fs = require("fs"),
	AWS = require('aws-sdk'),
	config = require('config'),
	async = require('async'),
	tokens = require("./temp/tokens.json");


//Setup

var callbackURL = config.host + ":" + config.port;
var oauth2Client = new OAuth2(config.google.clientId, config.google.clientSecret, callbackURL);

google.options({
    auth: oauth2Client
});


AWS.config.update({
    accessKeyId: config.aws.accessKeyId,
    secretAccessKey: config.aws.secretAccessKey
});

AWS.config.autoscaling = {
    region: config.region
};

var autoscaling = new AWS.AutoScaling();

init();


function init () {
	if(tokens.hasOwnProperty("refreshToken")) {
		//user has already accepted google access
		console.log("Using saved token");
		oauth2Client.setCredentials({
		  refresh_token: tokens.refreshToken
		});
		getCalendar();
	} else {
		//user hasn't accepted google access
		console.log("Ask user for token");
		getGoogleToken(function done () {
			getCalendar();
		});
	}
}

function getGoogleToken (callback) {

    var url = oauth2Client.generateAuthUrl({
        access_type: 'offline', // 'online' (default) or 'offline' (gets refresh_token)
        scope: 'https://www.googleapis.com/auth/calendar',
        approval_prompt: 'force'
    });

    open(url);

    var server = http.createServer(function(request, response) {
        response.writeHead(200, {
            "Content-Type": "text/html"
        });
        response.write("You can close this page now");
        response.end();
        if (request.url.indexOf("/?code=") == 0) {
            var code = request.url.replace("/?code=", "");

	        oauth2Client.getToken(code, function(err, tokens) {
	            // Now tokens contains an access_token and an optional refresh_token. Save them.
	            if (err) {
	                console.log("Error", err);
	                return;
	            }
	            oauth2Client.setCredentials(tokens);
	            callback();

	            if (tokens.hasOwnProperty("refresh_token")) {
					fs.writeFile(
						"./temp/tokens.json",
						JSON.stringify({
							refreshToken: tokens.refresh_token
						}),
					function(err) {
					    if(err) {
					        console.log(err);
					    } else {
					        console.log("The file was saved!");
					    }
					});
	            }

	        });

        }
    });

    server.listen(config.port);
    console.log("Server is listening to port", config.port);
}

function getCalendar() {
    calendar.events.list({
        calendarId: config.google.calenderId,
        timeMin: new Date().toISOString()
    }, function(err, response) {
        if (err) {
            console.log("error", err);
            return;
        }

        if (response.items.length == 0) {
        	console.log("No calender events found.");
        	process.exit();
        }


        var scheduleItems = response.items.map(function(event) {
            try {
                var time = new Date(event.start.dateTime)
            } catch (err) {
                var time = 0
            }
            return {
                name: event.summary,
                desiredCapacity: event.description * 1,
                time: time
            };
        }).filter(function(event) {
            return event.time != 0 && event.name != "" && event.desiredCapacity && event.desiredCapacity != 0;
        });

        setAutoScalingSchedule(scheduleItems);

    });
}

function setAutoScalingSchedule (scheduleItems) {
	//Itearate with max pararel 2 request at the time
	async.eachLimit(scheduleItems, 2, function (item, callback) {
		var params = {
            AutoScalingGroupName: config.aws.scalingGroup,
            ScheduledActionName: item.name,
            DesiredCapacity: item.desiredCapacity,
            StartTime: item.time
        };
        autoscaling.putScheduledUpdateGroupAction(params, function(err, data) {
            if (err) {
            	console.log("autoscaling error in", item.name, err, err.stack);
            	callback(err);
            	return
            } else {
            	console.log("autoscaling finished for", item.name);
            	callback(null);
            }
        }, function (err) {
        	if (err) {
        		console.log("AutoScaling finished with errors", err);
        	} else {
        		console.log("AutoScaling finished successfuly");
        	}
        	process.exit();
        });
	})
}
