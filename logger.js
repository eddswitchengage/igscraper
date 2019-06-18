const fs = require('fs');
const log_file = './logs.json';

exports.read_logs = function(){
    try {
        const logs = fs.readFileSync(log_file);
        return JSON.parse(logs);        
    } catch (error) {
        console.log('Something went wrong trying to read logs: ' + error);
        return "";   
    }
}

exports.log_request = function(request){
    const logs = this.read_logs();
    logs.requests.push(request);
    this.update_file(logs);
}

exports.log_exception = function(exception){
    const logs = this.read_logs();
    logs.exceptions.push(exception);
    this.update_file(logs);
}

this.update_file = function(data){
    fs.writeFile(log_file, JSON.stringify(data), err =>{
        if(err){
            console.log('Something went wrong trying to save log');
            return;
        }
    });
}