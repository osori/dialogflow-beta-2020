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

async function getProductByName(productName) {
  let request = {
    method: 'GET',
    redirect: 'follow'
  }

  const serverReturn = await fetch(ENDPOINT_URL + '/products', request);

  if (!serverReturn.ok) {
    throw "Error while getting products list from server"
  }

  const serverResponse = await serverReturn.json()

  const productsDict = serverResponse.products;

  item = productsDict.find( ({name}) => name === productName );

  return item

}

async function getProductReviews(productId) {
  let request = {
    method: 'GET',
    redirect: 'follow'
  }

  const serverReturn = await fetch(ENDPOINT_URL + '/products/' + productId + '/reviews', request);

  if (!serverReturn.ok) {
    throw "Error while getting product reviews from server"
  }

  const serverResponse = await serverReturn.json()

  const reviews = serverResponse.reviews;

  return reviews
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
      alertUserNotLoggedIn(); return;
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

    if (!products.length) {
      agent.add("Your cart is empty.");
      return;
    }

    agent.add("There are " + products.length + " products in your cart: ");
    // use the Oxford Comma style to join tags
    let totalPrice = 0;
    products.forEach( (item, idx) => {
      agent.add(idx + ". " + item.count + " of " + item.name + " ($" + item.price + ")")
      totalPrice += item.price
    })
    agent.add("That is a total of $" + totalPrice + ".")
  }

  async function showProductList () {
    // category: required intent
    category = agent.parameters.category

    if (!token) {
      alertUserNotLoggedIn(); return;
    }

    await navigateTo("/" + category);
    agent.add("Here are items in " + category + ".");
  }

  async function showProductDetail () {
    // category: required intent
    const productName = agent.parameters.productname

    if (!token) {
      alertUserNotLoggedIn(); return;
    }

    let product = await getProductByName(productName);

    await navigateTo("/" + product.category + "/products/" + product.id);
    agent.add("Here you go, " + product.name + "!");
  }

  async function showProductReviews () {
    const productContext = agent.context.get('product-chosen')
    if (!productContext) {
      // TODO: product select prompt
    }

    if (!token) {
      alertUserNotLoggedIn(); return;
    }

    console.log(productContext)

    const product = await getProductByName(productContext.parameters.productname)
    const reviews = await getProductReviews(product.id)
    const averageRatings = reviews.reduce( (stars, next) => stars + next.stars, 0) / reviews.length

    agent.add("The average ratings for " + product.name + " is " + averageRatings + ". Here are the reviews: ");

    reviews.forEach( (review, idx) => {
      agent.add(idx+1 + ". " + review.title + " (" + review.stars + " stars) says,")
      agent.add('"' + review.text + '"')
    })
  }

  async function filterByTags() {
    const tags = agent.parameters.tag;

    let request = {
      method: 'POST',
      headers: {'x-access-token': token },
      redirect: 'follow'
    }

    for await (const tag of tags) {
      const serverReturn = await fetch(ENDPOINT_URL + '/application/tags/' + tag, request)

      if (!serverReturn.ok) {
        agent.add("Sorry, there was a problem while filtering products");
        return;
      }  
    }

    agent.add("Showing items with " + humanizeList(tags) + " tags...")

  }

  async function addToCart() {
    const productNameList = agent.parameters.productname

    let quantity = agent.parameters.quantity
    if (!quantity) {
      quantity = 1
    }

    if (!token) {
      alertUserNotLoggedIn(); return;
    }

    let request = {
      method: 'POST',
      headers: {'x-access-token': token },
      redirect: 'follow'
    }

    for await (const productName of productNameList) {
      const product = await getProductByName(productName)
      for (let i=0; i < quantity; i++) {
        const serverReturn = await fetch(ENDPOINT_URL + '/application/products/' + product.id, request)
  
        if (!serverReturn.ok) {
          agent.add("Sorry, there was a problem while adding the item to your cart");
          return;
        } 
      } 
      agent.add(product.name + " was successfully added to your cart!");
    }

  }
  
  async function deleteFromCart() {
    const productNameList = agent.parameters.productname

    if (!token) {
      alertUserNotLoggedIn(); return;
    }

    let request = {
      method: 'DELETE',
      headers: {'x-access-token': token },
      redirect: 'follow'
    }

    for await (const productName of productNameList) {
      const product = await getProductByName(productName)
      const serverReturn = await fetch(ENDPOINT_URL + '/application/products/' + product.id, request)

      if (!serverReturn.ok) {
        agent.add("Sorry, there was a problem while deleting the item from your cart");
        return;
      } 
      agent.add(product.name + " was successfully deleted from your cart!");
    }

  }

  async function reviewCart() {
    if (!token) {
      alertUserNotLoggedIn(); return;
    }

    await navigateTo('/cart-review');
    agent.add('Here are items in your cart. Now, would you like to place an order?')

  }

  async function confirmCart() {
    const productContext = agent.context.get('cart-review')

    if (!token) {
      alertUserNotLoggedIn(); return;
    }

    if (!productContext) {
      reviewCart();
      return;
    }

    await navigateTo('/cart-confirmed');
    agent.add('Awesome, your order has been placed. Thank you for shopping at WiscShop!')

  }

  async function navigateApp() {
    const page = agent.parameters.page
    agent.add(page)

    if (page === "home") {
     await navigateTo('/')
    } else if (page === "cart") {
      if (!token) {
        alertUserNotLoggedIn(); return;
      }
      await navigateTo('/cart')
    } else if (page === "signIn") {
      await navigateTo('/signIn')
    } else if (page === "signUp") {
      await navigateTo('/signUp')
    }

    agent.add('navigate!')

  }

  function alertUserNotLoggedIn () {
    agent.add("You are not logged in. Would you like to log in now?");
    // TODO: show login prompt
  }

  let intentMap = new Map()
  intentMap.set('Default Welcome Intent', welcome)
  // You will need to declare this `Login` content in DialogFlow to make this work
  intentMap.set('LOGIN', login) 
  intentMap.set('CATEGORY_LIST', getCategoryList) 
  intentMap.set('CATEGORY_DETAIL_TAGS', getTagListOfCategory)
  intentMap.set('CART_VIEW', getCartItemList)
  intentMap.set('PRODUCT_LIST', showProductList)
  intentMap.set('PRODUCT_DETAIL', showProductDetail)
  intentMap.set('PRODUCT_REVIEWS', showProductReviews)
  intentMap.set('PRODUCT_LIST_FILTER_BY_TAG', filterByTags)
  intentMap.set('CART_ADD', addToCart)
  intentMap.set('CART_DELETE', deleteFromCart)
  intentMap.set('CART_REVIEW', reviewCart)
  intentMap.set('CART_CONFIRM', confirmCart)
  intentMap.set('APPLICATION_NAVIGATE', navigateApp)
  agent.handleRequest(intentMap)
})

app.listen(process.env.PORT || 8080)
