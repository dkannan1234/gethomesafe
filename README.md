# GetHomeSafe

An application meant to help people arrive at their destinations with more peace of mind by matching users together based on their travel itinerary. There is an in-built messaging feature that users can communicate with and a map to show their intended travel plans. 

## Run instructions

This app was built using React. To run it, first clone the repository using ```git pull ```. Next, change your directory using ```cd gethomesafe```, then run ```npm install```. If you don't have Node.js installed, you can find a link to download it [here](https://nodejs.org/en/download/). Finally, run the command ```npm run dev``` and copy the link in the terminal to a web browser to preview the app. NOTE: In order to run this code, you need to create API keys for the following programs: 

MONGODB_URI= <br>
PORT=4000<br>
SENDGRID_API_KEY=<br>
EMAIL_FROM=<br>
FRONTEND_URL=<br>
JWT_SECRET=<br>

These should be placed in a file called server/.env <br>

Additionally, an API key google maps must be created and placed in the file .env.local in the root directory. <br>
<br>
VITE_GOOGLE_MAPS_KEY=<br>

These are not provided in the github repo to ensure the safety of our users. 
## Feature showcases

In a terminal window, open the /server folder and run node index.js. Then, run npm run dev -- --host 0.0.0.0 in a seperate window to generate a link to the website. This will allow you to sign up or log in. When signing up, include your name, number, email, a secure password, a brief bio, and agree to terms and conditions. After verifying your email, you are free to sign up! Log in to see create a new trip. You can select a start and end location and look for other buddies nearby. When matching, users display a number, their rating by other users, and their bio. If you want to find another match, you can click the refresh button to see another walking buddy. Alternatively, you can look for a virtual walking buddy and call them through their provided number if you do not wish to meet in-person. After your trip, you can leave a review of your walking buddy! 


## Attributions

The use of LLMs, ChatGPT 5.1 in particular, was limited to debugging and feature support. All code was initially written by our project team. 
