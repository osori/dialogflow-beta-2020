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

function humanizeList(list) {
  if (list.length > 2) {
    return list.splice(0, list.length-1).join(', ') + ", and " + list[0];
  } else {
    return list.join(' and ');
  }
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

  async function getCategoryList () {
    let request = {
      method: 'GET',
      redirect: 'follow'
    }

    const serverReturn = await fetch(ENDPOINT_URL + '/categories', request);

    if (!serverReturn.ok) {
      agent.add("Sorry, there was a problem getting the list of categories.");
      return;
    }  

    const serverResponse = await serverReturn.json()
    let categories = serverResponse.categories;

    agent.add("We currently offer " + categories.length + " categories: ");
    // use the Oxford Comma style to join categories
    agent.add(categories.splice(0, categories.length-1).join(', ') + ", and " + categories[0] + ".");
  }

  async function getTagListOfCategory () {
    category = agent.parameters.category.toLowerCase();
    let request = {
      method: 'GET',
      redirect: 'follow'
    }

    const serverReturn = await fetch(ENDPOINT_URL + '/categories/' + category + '/tags', request);

    if (!serverReturn.ok) {
      agent.add("Uh-oh, we currently don't have items in the " + category + " category.");
      await getCategoryList();
      return;
    }  

    const serverResponse = await serverReturn.json()
    let tags = serverResponse.tags;

    agent.add("There are " + tags.length + " tags for " + category + ": ");
    // use the Oxford Comma style to join tags
    agent.add(humanizeList(tags) + ".");
  }

  async function getCartItemList () {
    let request = {
      method: 'GET',
      headers: {'x-access-token': token },
      redirect: 'follow'
    }

    if (!token) {
      agent.add("You are not logged in. Would you like to log in now?");
      // TODO: show login prompt
    }

    const serverReturn = await fetch(ENDPOINT_URL + '/application/products/', request);

    if (!serverReturn.ok) {
      agent.add("Sorry, there was a problem getting your cart.");
      let s = await serverReturn.json();
      agent.add(s);
      return;
    }  

    const serverResponse = await serverReturn.json()
    let products = serverResponse.products;

    agent.add("There are " + products.length + " products in your cart: ");
    // use the Oxford Comma style to join tags
    products.forEach( (item, idx) => {
      agent.add(idx + ". " + item.count + " of " + item.name + " ($" + item.price + ")")
    })
  }

  let intentMap = new Map()
  intentMap.set('Default Welcome Intent', welcome)
  // You will need to declare this `Login` content in DialogFlow to make this work
  intentMap.set('LOGIN', login) 
  intentMap.set('CATEGORY_LIST', getCategoryList) 
  intentMap.set('CATEGORY_DETAIL_TAGS', getTagListOfCategory)
  intentMap.set('CART_VIEW', getCartItemList)
  agent.handleRequest(intentMap)
})

app.listen(process.env.PORT || 8080)
