# AWS-AutoScaling-Google-Calander



Script that lets you control desired ammount of servers in AWS AutoScaling groups by changing events in Google Clander

First: `npm install`

Second: configure your info in `config/local.yaml` using `config/default.yaml` as a base

Third: `node .`

The script will automaticaly open a browser window if you don't have the required permissions to access google, after that it will save the refresh token so it doesn't have to do that again.
