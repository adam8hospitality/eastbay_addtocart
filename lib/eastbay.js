(function(){
	"use strict";

	var request = require('request'), 
	    events = require('events'),
	    async = require('async'),  
	    q = require('q'),
	    url = require('url'),
	    util = require('util'),
	    cheerio = require('cheerio');
	var j = request.jar();
	var log = console.log;
	var root;

	request = request.defaults({
	  jar: j,
	  followRedirect: true,
	  followAllRedirects: true,
	  maxRedirects: 10,
	  headers: {
	    'User-Agent': 'Mozilla/5.0 (Windows NT 6.1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/35.0.1916.114 Safari/537.36'
	    }
	  });

	function Eastbay(options){
		this.options = options || {};		
		this._urls={
			base: 'http://www.eastbay.com/',
			cart: 'http://www.eastbay.com/shoppingcart/default.cfm',
			addToCart: 'http://www.eastbay.com/catalog/miniAddToCart.cfm?secure=0',
			account: 'https://www.eastbay.com/account/default/',
			loginForm: 'http://www.eastbay.com/login/login_form.cfm',			
		};
		this.errorMsgs = [
			'We\'re sorry, but this item is currently out of stock and no longer available..',
			'Sorry, we did not find a match for your entry. Please try again'
		];
		root = this;
	}

	Eastbay.prototype.urlToSKU = function(url){
		var match
		if(match = url.match(/sku\-(\w+)/i)){
			return match[1];
		}
		else if(match = url.match(/sku:(\w+)/i)){
			return match[1];
		}
		return false;

	};
	Eastbay.prototype.getSizes = function(body,sku){
		var match;

		if(match = body.match(/styles\s*=(.*?});/i)){
			try{
				var styles = JSON.parse(match[1]);
				if(styles[sku]){
					var sizes = [];
					return styles[sku][7].map(function(e){return e.shift().trim();});					
				}
				else{
					throw new Error('Style not found');
				}
			}
			catch(e){
				log('Error in getting size: ',e);
				return [];
			}
		}
	};

	Eastbay.prototype.waitTillLaunched = function(product){
		var deferred = q.defer();
		product.sku = product.sku || root.urlToSKU(product.url);

		function checkLaunchTime(){
			log('Checking if product is launched...');
			request(product.url, function (err,resp,body) {        			      
	      if (!err && resp.statusCode == 200) {			      	
	        var $ = cheerio.load(body);
	        var sizes = root.getSizes(body,product.sku);
	        if(sizes.indexOf(product.size)===-1){
        		return deferred.reject(new Error('Given product size is not available. Size can be one of ')+sizes.join());
        	}

	        log('Product Found: ',$('.product_content .product_title').text());
	        try{
	        	var sku = root.urlToSKU(product.url);
	        	var productLaunchStyles = JSON.parse(body.match(/productLaunchStyles\s*=(.*?);/i)[1]);
	        	var productLaunchTimeUntil = parseInt(body.match(/productLaunchTimeUntil\s*=\s*(-?\d+)/i)[1]);	        	

	        	if(productLaunchStyles.indexOf(sku) !== -1 && productLaunchTimeUntil > 0){
	        		log('Product is not launched yet');
	        		log('Time to launch: ',(productLaunchTimeUntil/60).toFixed(2), 'minutes');

	        		var recheck = parseInt(productLaunchTimeUntil/2);
	        		log('Will check again in: ',(recheck/60).toFixed(2), 'minutes');
	        		q.delay(recheck*1000).then(checkLaunchTime);
	        	}
	        	else{
	        		log('Product launched!!');
	        		deferred.resolve();	
	        	}	        		        		        	
	        }	
	        catch(e){
	        	deferred.reject(e);
	        }
	        
	                     
	      }      
	    });	
		}

		checkLaunchTime();			
		return deferred.promise;
	};

	Eastbay.prototype.waitTilladdedToCart = function(product){		
		product.sku = product.sku || root.urlToSKU(product.url);
		root._product = product;
		var retryLimit = 20;

		var deferred = q.defer();
		function addToCart (){
			async.waterfall([
			    function loadProduct(callback){
		    		var post_body = {};
		    		log('loading product page');
		    		request(product.url, function (err,resp,body) {        			      
				      if (!err && resp.statusCode == 200) {			      	
				        var $ = cheerio.load(body);			       
				        $('#product_form').find('input,select,textarea,button').each(function(){
				        	post_body[$(this).attr('name')] = $(this).val();
				        });
				        

				        product.title = $('.product_content .product_title').text();
				        log('Found product: ', product.title, ' | ', product.size);
				        post_body.inlineAddToCart = '1';
				        post_body.size = product.size;			        
				        post_body.sku = product.sku;
				      }
				      callback(err,post_body);
				    });		        
			    },
			    function addToCart(post_body, callback){
			      var obj = {
				      url: root._urls.addToCart,
				      form : post_body,      
				      headers : {
				        'Referer' : root.options.url,
				        'User-Agent': 'Mozilla/5.0 (Windows NT 6.1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/35.0.1916.114 Safari/537.36',          
				      }
				    };   
				    //log(obj);
				    log('Adding to cart'); 
				    request.post(obj, function (err, resp, body) {            				     		     
				      if (!err && resp.statusCode == 200) {		
				        if(body.match('Item added to cart:')){
				        	log('Product added to cart.');			        	
				        }
				        else if(body.match('We\'re sorry, but this item is currently out of stock and no longer available..'))
				        	err = new Error('We\'re sorry, but this item is currently out of stock and no longer available..');
				        else if(body.match('We\'re sorry, but this item is currently not available for purchase.'))
				        	err = new Error('We\'re sorry, but this item is currently not available for purchase.');
				        else if(body.match('Order quantity is limited on this product to per customer'))
				        	err = new Error('Order quantity is limited on this product to per customer');				       
				        else
				        	err = new Error('unknown error');
				      }
				      callback(err);    
				    }); 		        				        
			    }
			], function (err) {
					if(!retryLimit){
						deferred.reject(err);
					}					
					else if(err){
						retryLimit -= 1;
						log('Error', err);
						log('Retrying in 5 secs...');
						setTimeout(addToCart,5*1000);
					}
					else
						deferred.resolve(product);				
			});	
		}
		
		addToCart();
		return deferred.promise;	
	};

	Eastbay.prototype.login = function(user,productToValidate){
		productToValidate = productToValidate || root._product;
		user = user || {};
		var deferred = q.defer();
		async.waterfall([
		    function loadLoginPage(callback){
	        log('loading login page');
	       
	        request(root._urls.account, function (err,resp,body) {        
			      var post_body = {},action_url;    
			      if (!err && resp.statusCode == 200) {
			        var $ = cheerio.load(body);
			        var loginForm = $('form[name="accountSignInForm"]');

			        loginForm.find('input,select,textarea,button').each(function(){
			        	if(!$(this).attr('name'))
			        		return;
			        	post_body[$(this).attr('name')] = $(this).val();
			        });	
			        post_body.email = user.username;
			        post_body.password = user.password;
			        action_url = loginForm.attr('action');			        			        
			      }
		      	callback(err,action_url,post_body);
		    	});				        
		    },
		    function doLogin(action_url,post_body, callback){		        
		    	var obj = {
			      url: action_url,
			      form : post_body,      
			      headers : {
			        'Referer' : root._urls.account,
			        'User-Agent': 'Mozilla/5.0 (Windows NT 6.1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/35.0.1916.114 Safari/537.36',          
			      }
			    };  
			    //log(obj);			   	    
			    request.post(obj, function (err, resp, body) {  			    	          				     		    
			      if (!err) {
				      var $ = cheerio.load(body);				      		      
			        if(body.match('Sign-Out')){
			        	log('Logged in:',user.username,' / ',user.password);			        	
			        }
			        else
			        	err = new Error($('#errMsg li').text());
			      }			      
			      callback(err);    
			    });				        
		    },
		    function loadCart(callback){		        
		    	log('loading cart');	        
	        request(root._urls.cart, function (err,resp,body) {        
		         
		      if (!err) {
		      	var $ = cheerio.load(body);   
		      	if($('#shoppingCartForm input[value="'+productToValidate.sku+'"]')){
		      		log('product confirmed.');		      		
		      	}		
		      	else err = new Error('product not found.')        
		      }
		      callback(err);
		    });				        
		    }
		], function (err) {
				if(err) deferred.reject(err);
				else deferred.resolve();				
		});
		return deferred.promise;	
	};
	Eastbay.prototype.multiLogin = function(users){
		var deferred = q.defer();
		async.eachLimit(users,10,function(user,callback){
			root.login(user).then(function(){
				callback();
			},function(err){
				log(err);
				callback();
			});
		},function(err){
			deferred.resolve();
		})
		return deferred.promise;
	}

	exports.Eastbay = Eastbay;	
	exports.addToCart = Eastbay.addToCart;

})();
