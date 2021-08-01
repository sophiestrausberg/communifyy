require("dotenv").config()
const express = require("express");
const bodyParser = require("body-parser");
const ejs = require("ejs");
const mongoose = require("mongoose");
const session = require('express-session');
const passport = require("passport");
const passportLocalMongoose = require("passport-local-mongoose");
const axios = require('axios').default;
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const findOrCreate = require('mongoose-findorcreate')
const https = require("https");
var fs = require('fs');

const app = express();

let http = require('http').Server(app);

app.use( express.static( "public" ) );
app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({extended: true}));

//use session package + set up with inital configuration
app.use(session({
  secret: "Our little secret.",
  resave: false,
  saveUninitialized: false
}));

//initialize passport
app.use(passport.initialize());
//also use passport for managing the session
app.use(passport.session());

//to know which code to write regarding packages, read their documentation!!


//use to connect to mongodb by specifing the url of mongodb (port 27017, name of database: userDB)
mongoose.connect("mongodb://localhost:27017/charityDB", {useNewUrlParser: true, useUnifiedTopology: true });
mongoose.set("useCreateIndex", true);

const charitySchema = new mongoose.Schema({
  lat: Number,
  long: Number,
  name: String, 
  desc: String,
  type: String,
  address: String,
  email: String,
  phoneNumber: String,
  authenticated: Boolean,
  messages: [Object]
});

const Charity = new mongoose.model("Charity", charitySchema);

const messageSchema = new mongoose.Schema({
  name: String,
  email: String,
  mess: String,
});

const Message = new mongoose.model("Message", messageSchema);

//in order to use plugins your schema must not be a standard js object, but a mongoose schema
const userSchema = new mongoose.Schema({
  email: String,
  password: String,
  googleId: String,
  secret: String,
  organization: Object,
  organizationId: String,
});

userSchema.plugin(passportLocalMongoose);
userSchema.plugin(findOrCreate);

const User = new mongoose.model("User", userSchema);

//create a local login strategy
passport.use(User.createStrategy());

//serialize + deserialize the user
passport.serializeUser(function(user, done) {
  done(null, user.id);
});

passport.deserializeUser(function(id, done) {
  User.findById(id, function(err, user) {
    done(err, user);
  });
});

passport.use(new GoogleStrategy({
  clientID: process.env.CLIENT_ID,
  clientSecret: process.env.CLIENT_SECRET,
  callbackURL: "http://localhost:3000/auth/google/companyx"
},
function(accessToken, refreshToken, profile, cb) {
  User.findOrCreate({ googleId: profile.id }, function (err, user) {
    return cb(err, user);
  });

}
));

app.get('/auth/google',
passport.authenticate('google', { scope: ['profile'] })
);

app.get('/auth/google/companyx', 
passport.authenticate('google', { failureRedirect: '/login' }),
function(req, res) {

  //here it is
  var user = req.user;
  console.log(user)
  console.log(user.organization)

  //username not specified, then username_1
 

  if (user.organization !== undefined) {
    console.log("I AM GETTING A COMMAND FROM THE /AUTH TO LOAD THE HOME PAGE")
    res.redirect("/");
  } else {
    res.redirect("/search")
  }

});

var charities = []

app.get("/", function(req, res){ 

  Charity.find({}, function(err, foundItems){
    charities = []
    foundItems.forEach(function(item){
      charities.push(item)
    })
    if (req.user !== undefined) {
      res.render(__dirname + '/public/map.ejs', {data: charities, user: req.user.organization, key: process.env.GOOGLE_KEY})
    } else {
      res.render(__dirname + '/public/map.ejs', {data: charities, user: "not specified", key: process.env.GOOGLE_KEY})
    }
    
  });

});


app.get("/search", function(req, res){
    res.render(__dirname + '/public/search.ejs')
})

app.get("/authenticate", function(req, res){
  res.render(__dirname + '/public/authenticate.ejs')
})

app.post("/location", function(req, res){

    var location = req.body.searchInput;
    var name = req.body.organizationName;
    var email = req.body.email;
    var phoneNumber = req.body.phoneNumber;
    var description = req.body.description;
    var type = req.body.type;

    axios.get("https://maps.googleapis.com/maps/api/geocode/json", {
      params: {
        address: location,
        key: process.env.GOOGLE_KEY
      }
    })
    .then(function(response){
  
      //GEOMETRY (LAT + LONG)
      var latt = response.data.results[0].geometry.location.lat;
      var longg = response.data.results[0].geometry.location.lng;

      console.log(latt, longg)

      // save data given in new charity object
      const charity = new Charity ({
        lat: latt,
        long: longg,
        name: name,
        desc: description,
        type: type,
        address: location,
        email: email,
        phoneNumber: phoneNumber,
        authenticated: false
      })

      charity.save();

      console.log("hello")
      console.log("charity is" + charity)

      var user = req.user;

      User.updateOne({_id: user._id}, {organization: charity}, function(err, userr) {
        console.log(userr)
        if (err) {
          console.log(err)
        } else {
          console.log("OK!")
        }
      })

      User.updateOne({_id: user._id}, {organizationId: charity._id}, function(err, userr) {
        if (err) {
          console.log(err)
        } else {
          console.log("OK! the charity id thing works ig.")
        }
      })

    })
    .then(function(response){
      res.redirect("/");
    })
    .catch(function(err){
      console.log(err);
    })

});

app.get("/place/:placeId", function(req, res){
  const requestedPlaceId = req.params.placeId;
  console.log(requestedPlaceId);

  var user = req.user;

  Charity.findOne({_id: requestedPlaceId}, function(err, place){
    if (place != undefined) {
      res.render(__dirname + "/public/place", {
        title: place.name,
        content: place.desc,
        place: requestedPlaceId,
        messageSent: false,
        user: user,
        authenticated: place.authenticated, 
        type: place.type, 
        email: place.email,
        phone: place.phoneNumber
      });
     } else {
       res.render(__dirname + "/public/404")
     }
  });

});

app.get("/register", function(req, res){
  res.render(__dirname + '/public/register.ejs')
})

app.post("/register", function(req, res){

  User.register({username: req.body.username}, req.body.password, function(err, user){
      if (err) {
          console.log(err);
          res.redirect("/register");
      } else {
          passport.authenticate("local")(req, res, function(){
              res.redirect("/search")
          })
      }
  })

});

app.post("/login", function(req, res) {
  
  //IF UNAUTHORIZED, TAKE TO REGISTER PAGE WITH MESSAGE LIKE "THIS EMAIL IS NOT REGISTERED WITH US."
  
  const user = new User({
      username: req.body.username,
      password: req.body.password
  });

  req.login(user, function(err){
      if (err) {
          console.log(err);
      } else {
          passport.authenticate("local")(req, res, function(){
              res.redirect("/");
          })
      }
  })

});

app.get("/logout", function(req, res){
  req.logout();
  res.redirect("/")
})

app.post("/messages/:placeId", function(req, res){

  console.log("messages was posted")

  const requestedPlaceId = req.params.placeId;

  const message = new Message ({
    name: req.body.name,
    email: req.body.email,
    mess: req.body.message,
  })

  message.save();

  Charity.updateOne({_id: requestedPlaceId}, {$push: {messages: message}}, function(err, userr) {
    console.log(userr)
    if (err) {
      console.log("error when updating messages in charity was: " + err)
    } else {
      console.log("OK! Added message to messages.")
    }
  })

  res.redirect("/place/" + requestedPlaceId)

})

app.get("/messages/:placeId", function(req, res){
  const requestedPlaceId = req.params.placeId;
  console.log(requestedPlaceId);

  var user = req.user 
  console.log("user is" + user)

  Charity.findOne({_id: requestedPlaceId}, function(err, place){
    if (place != undefined) {
      res.render(__dirname + "/public/messages", {
        title: place.name,
        messages: place.messages,
        place: requestedPlaceId,
        messageSent: false,
        user: user
      });
     } else {
       res.render(__dirname + "/public/404")
     }
  });
});

  app.post("/edit/:placeId", function(req, res){
    const requestedPlaceId = req.params.placeId;
  
    Charity.findOne({_id: requestedPlaceId}, function(err, place){
      if (place != undefined) {
        res.render(__dirname + "/public/edit", {
          title: place.name,
          content: place.desc,
          place: requestedPlaceId,
          type: place.type,
          address: place.address,
          email: place.email,
          phone: place.phoneNumber,
        });
       } else {
         res.render(__dirname + "/public/404")
       }
    });
  });

  app.post("/edited/:placeId", function(req, res){

    console.log("post loadedddddd")
  
    const requestedPlaceId = req.params.placeId;
    console.log("POST OF" + requestedPlaceId)

    var location = req.body.searchInput;
    var name = req.body.organizationName;
    var email = req.body.email;
    var phoneNumber = req.body.phoneNumber;
    var description = req.body.description;
    var type = req.body.type;

    allProperties = {
      "address": location,
      "name": name,
      "email": email,
      "phoneNumber": phoneNumber,
      "desc": description,
      "type": type,
    }


    Object.entries(allProperties).forEach(([key, value]) => {
      if (value !== "") {

            var query = {}
            query[key] = value

                    Charity.updateOne({_id: requestedPlaceId}, query, function(err, results) {
                      if (err) {
                        console.log("error when updating charity was: " + err)
                      } else {
                        console.log("OK!")
                      }
                    })          

      }
      
    });
        
    Charity.findOne({_id: requestedPlaceId}, function(err, results) {
      console.log("results are:" + results)

      User.updateOne({organizationId : requestedPlaceId}, {organization: results}, function(err, results){
        if (err) {
          console.log("error when updating charity was: " + err)
        } else {
          // console.log("property " + key + "is updated to " + value)
          console.log("OK!")
        }
      })
    });    

    console.log("phone number is:" + req.body.phoneNumber)
  
    res.redirect("/place/" + requestedPlaceId)
  
  })

  app.get("/auth/:placeId", function(req, res){
    const requestedPlaceId = req.params.placeId;
    var user = req.user

     Charity.findOne({_id: requestedPlaceId}, function(err, place){
        res.render(__dirname + "/public/testing", {
          user: user,
          place: requestedPlaceId,
        });
      })
})

app.post("/trtr/:placeId", function(req, res){

  const requestedPlaceId = req.params.placeId;

  console.log("I loaded.")
  console.log("ein is" + req.body.ein)
  const ein = req.body.ein;

    const app_id = "9d0d0325";
    const app_key = "99db8a2d89f99d28b496906f9d1e6e14";
    const url = "https://api.data.charitynavigator.org/v2/Organizations/" + ein + "?app_id=9d0d0325&app_key=99db8a2d89f99d28b496906f9d1e6e14";

    https.get(url, function(response){
        
    console.log(response.statusCode);

    response.on("data", function(data){
        const weatherData = JSON.parse(data);
        const nameFound = weatherData.charityName;
        console.log(nameFound)


        Charity.findOne({_id: requestedPlaceId}, function(err, place){
          console.log("1. charity was found")
          console.log(place)
          if (place.name == nameFound) {
           
            Charity.updateOne({_id: requestedPlaceId}, {authenticated: true}, function(err, results) {
              console.log(results)
              if (err) {
                console.log("error when updating messages in charity was: " + err)
              } else {
                console.log("2. Charity was updated.")
              }
            })
            
           } else {
             console.log("not valid...")
           }

           Charity.findOne({_id: requestedPlaceId}, function(err, results) {
            console.log("results are:" + results)
      
            User.updateOne({organizationId : requestedPlaceId}, {organization: results}, function(err, results){
              if (err) {
                console.log("error when updating charity was: " + err)
              } else {
                // console.log("property " + key + "is updated to " + value)
                console.log("3. User was updated")
              }
            })
          });  
          
          res.redirect("/place/" + requestedPlaceId)

        });
        
    });
  });

});




app.listen(3000, function(){
    console.log("server started on port 3000.")
});