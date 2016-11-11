console.log = function (log) {
  return function () {
  	var a = new Date();
    var args = Array.prototype.slice.call(arguments);
    args.unshift('[' + a.getMonth() +'/'+a.getDate()+'/'+a.getFullYear()+' ' + a.toLocaleTimeString() + '] '); // Push millis as first argument
    log.apply(console, args);
  };
}(console.log);

var config = require("./config");
var Eastbay = require('./lib/eastbay').Eastbay;
var bot = new Eastbay();

var product = {
	url: 'http://www.eastbay.com/product/model:251720/sku:06809002/nike-air-max-95-sneakerboots-mens/all-black/black/',
	size: '10.0',
};


bot.waitTillLaunched(product)
	.then(function(){
		return bot.waitTilladdedToCart(product);
	})
	.then(function(product){
		//console.log(product);
		return bot.multiLogin(config.users);
	})
	.then(function(){
		console.log('Done');
	})
	.catch(function(err){
		console.log(err);
	});


