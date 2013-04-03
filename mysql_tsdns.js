#!/usr/bin/node
var log = require('util').log;
var net = require('net');
var fs = require('fs');
var mysql = require('mysql');
var connection, server;

(function start() {
    log('Starting MySQL-TSDNS-Server for Teamspeak 3');
    connection = mysql.createClient({
        host: 'localhost',
        user: 'tsdns',
        password: 'tsdns',
        database: 'tsdns',
        debug: false
    });
    connection.on('error', function(err) {
        if (!err.fatal) {
            return;
        }

        if (err.code !== 'PROTOCOL_CONNECTION_LOST') {
            throw err;
        }
        log('Lost Connection to the MySQL-Database...');
        
        server.close(function() {
            log('Server Closed, restarting programm...');
            start();
        });
    });

    server = net.createServer(function (socket) {
        var writeEnd = function(message) {
            socket.write(message, function() {
                socket.end();
            });
        };
        var dataTimeout = setTimeout(function() {
            writeEnd('404');
        }, 500);
        var freeTimeout = setTimeout(function() {
            writeEnd('404');
        }, 5000); //Timeout for freeing connection-count
        socket.on('data', function(data) {
            clearTimeout(dataTimeout);
            domain = data.toString().replace(/\r|\n/g, '');
            debug('Searching for domain "'+domain+'":');
            debug('  Getting Server-Tables...');
            connection.query('SELECT tableName, additionalColumns FROM serverTables WHERE active=1 ORDER BY orderID', function(error, tableResults) {
                if(error) {
                    throw error;
                }
                tables = tableResults;
                
                (function searchForDomain() {
                    var table = tables.shift();
                    debug('  Searching in Server-Table "'+table.tableName+'"...');
                    if(table.additionalColumns) {
                        var additionalColumns = ', '+table.additionalColumns;
                    } else {
                        var additionalColumns = '';
                    }
                    connection.query('SELECT domain, address'+additionalColumns+' FROM '+table.tableName+' WHERE domain=? AND active=1', [domain], function(error, rows) {
                        if(error) {
                            throw error;
                        }
                        if(rows.length===1) {
                            debug('  Found something...');
                            var row = rows[0];
                            if(typeof row.lastLookup!=="undefined") {
                               debug('  Updating lastLookup-Column...');
                                connection.query('UPDATE '+table.tableName+' set lastLookup=\''+parseInt(Date.now()/1000)+'\' WHERE domain=?', [row.domain], function(error) {
                                    if(error) {
                                        throw error;
                                    }
                                });
                            }
                            writeEnd(row.address);
                        } else if(tables.length>0) {
                            searchForDomain();
                        } else {
                            debug('  Searching in serverDefault-Table...');
                            connection.query('SELECT address FROM serverDefault WHERE active=1 LIMIT 1', function(error, rows) {
                                if(error) {
                                    throw error;
                                }
                                if(rows.length==1) {
                                    debug('  Found something...');
                                    writeEnd(rows[0].address);
                                } else {
                                    debug('  Found nothing, seems like the searched Domain doesn\'t exists...');
                                    writeEnd('404');
                                }
                            });
                        }
                    });
                })();
            });
        });
        socket.on('error', function(error) {}); //Blackhole all Errors
    });
    server.on('close', function() {
        if(typeof connection.close=="function") connection.close();
        log('Stopped MySQL-TSDNS-SERVER for Teamspeak 3');
    })
    server.listen(41144);
})();
function debug(message) {
    //log(message);
}