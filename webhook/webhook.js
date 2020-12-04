const express = require('express')
const { WebhookClient } = require('dialogflow-fulfillment')
const app = express()
const fetch = require('node-fetch')
const base64 = require('base-64')

let username = "";
let password = "";
let token = "";

USE_LOCAL_ENDPOINT = false;
// set this flag to true if you want to use a local endpoint
// set this flag to false if you want to use the online endpoint
ENDPOINT_URL = ""
if (USE_LOCAL_ENDPOINT){
ENDPOINT_URL = "http://127.0.0.1:5000"
} else{
ENDPOINT_URL = "https://mysqlcs639.cs.wisc.edu"
}



async function getToken () {
  let request = {
    method: 'GET',
    headers: {'Content-Type': 'application/json',
              'Authorization': 'Basic '+ base64.encode(username + ':' + password)},
    redirect: 'follow'
  }

  const serverReturn = await fetch(ENDPOINT_URL + '/login',request)

  if (!serverReturn.ok) {
    throw "Login failed"
  }

  const serverResponse = await serverReturn.json()
  token = serverResponse.token

  return token;
}

// function that navigate the user to a specific page
async function navigateTo (page) {
  let request = {
    method: 'PUT',
    headers: {'Content-Type': 'application/json',
              'x-access-token': token },
    body: JSON.stringify({ page: '/' + username + page,
                           dialogflowUpdated: true,
                           back: false}),
    redirect: 'follow'
  }

  const serverReturn = await fetch(ENDPOINT_URL + '/application', request);

  if (!serverReturn.ok) {
    throw "Error while navigating user"
  }

  const serverResponse = await serverReturn.json()

  return serverResponse;
}

app.get('/', (req, res) => res.send('online'))
app.post('/', express.json(), (req, res) => {
  const agent = new WebhookClient({ request: req, response: res })

  function welcome () {
    agent.add('Webhook works!')
    console.log(ENDPOINT_URL)
  }

  async function login () {
    // You need to set this from `username` entity that you declare in DialogFlow
    username = agent.parameters.username;
    // You need to set this from password entity that you declare in DialogFlow
    password = agent.parameters.password;

    try {
      await getToken()
    } catch {
      // login fail
      agent.add('Sorry, there was a problem logging you in.');
      return;
    }

    // login success
    agent.add("Welcome to WiscShop, " + username + "!");
  }


  let intentMap = new Map()
  intentMap.set('Default Welcome Intent', welcome)
  // You will need to declare this `Login` content in DialogFlow to make this work
  intentMap.set('LOGIN', login) 
  agent.handleRequest(intentMap)
})

app.listen(process.env.PORT || 8080)
