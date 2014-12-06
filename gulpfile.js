// Include gulp
var gulp = require('gulp'); 


// Include Plugins
var jshint = require('gulp-jshint');


// Lint Task
gulp.task('lint', function() {
    return gulp.src('*.js')
        .pipe(jshint())
        .pipe(jshint.reporter('default'));
});

// Watch Files For Changes
gulp.task('watch', function() {
    gulp.watch('*.js', ['lint']);    
});

// Default Task
gulp.task('default', ['lint', 'watch'],function(){
	var app = require('./app');
});