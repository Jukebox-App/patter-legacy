// Times in minutes;
var goneTimeout = 5;
var idleTimeout = 5;
var keepaliveTimeout = 4;

var globalFeedTimer;
var keepaliveTimer;
var updateFeedDisplay = true;
var feedBuffer = "";
var feedArray = [];
var userId;
var currentUser;
var accessToken;
var chatRoom;
var rooomName = "Chat Room";
var userLiveTimes = {};
var userPostTimes = {};
var minId = 0;
var lastUserList = "";

function initialize() {
    var hashParams = getHashParams();

    accessToken = hashParams['access_token'];
    chatRoom = hashParams['room'];
    if (chatRoom == null) {
	chatRoom = $.cookie("patterRoom");
    }

    if (accessToken == null) {
        accessToken = $.cookie("patterAccessToken");
	if (accessToken == null && chatRoom != null) {
	    $.cookie("patterRoom", chatRoom, {expires: 30, path: "/"});
	} else {
	    $.cookie("patterRoom", null, {expires: 30, path: "/"});
	}
    } else if (chatRoom != null) {
        $.cookie("patterAccessToken", accessToken, {expires: 30, path: "/"});
	$.cookie("patterRoom", null, {expires: 30, path: "/"});
	refreshPage();
    }

    $("#main").hide();
    $("#main-logged").hide();
    $("#main-join").hide();

    if (accessToken != null) {
        // have access - get user info
        getUserInfo('me');
    } else {
	$("#main").show();
    }
}

function getUserInfo(uid) {
    endpoint = "https://alpha-api.app.net/stream/0/users/" + uid;
    
    $.ajax({
	url: endpoint,
	type: "GET",
	data: { access_token: accessToken },
	dataType: "json"
    }).done(function(data) {
	if (data.id.length > 0 && data.name.length > 0) {
	    console.log("Current user:");
	    console.dir(data);
	    currentUser = data;
	    userId = data.id;
	    $("#user_avatar").attr("src", currentUser.avatar_image.url);
	    $("#user_name").html(currentUser.name);
	    $("#user_username").html("@" + currentUser.username);
	    $("#form_post").on("submit", function(event) {
		if ($("#main_post").val().length > 0) {
		    postMessage($("#main_post").val());
		}
		return false;
	    });
	    $("#create_button").on("click", function(event) {
		createRoom($("#create_name").val());
	    });
	    if (chatRoom != null) {
		$("#main-logged").show("slow");
		initName();
		updateGlobalFeed();
		keepalive();
	    } else {
		$("#main-join").show("slow");
	    }
	} else {
	    console.log("Could not get user info.");
	}
    }).fail(function(req, status) {
	$("#main").show();
	console.log("getUserInfo failed: " + status);
	console.dir(req);
	console.dir(req.getAllResponseHeaders());
    });
}

function initName() {
    endpoint = "https://alpha-api.app.net/stream/0/posts/" + chatRoom;
    endpoint += "?include_annotations=1&include_machine=1";
    $.ajax({
	url: endpoint,
	type: "GET",
	dataType: "json",
	beforeSend: setHeader
    }).done(function(data) {
	var annotations = data.annotations;
	if (annotations != null) {
	    var j = 0;
	    for (; j < annotations.length; ++j) {
		if (annotations[j].type == "snark.room") {
		    roomName = annotations[j].value.name;
		    var htmlText = htmlEncode(roomName)
		    $("#room-name").html(htmlText);
		}
	    }
	}
    });
}

function updateGlobalFeed() {
    clearTimeout(globalFeedTimer);

    endpoint = "https://alpha-api.app.net/stream/0/posts/" + chatRoom
	+ "/replies";

    var params = new Object;
    params.access_token = accessToken;
    params.include_machine = 1;
    params.include_annotations = 1;
    params.count = 200;

    if ($("#global-tab-container").children().length > 0) {
	params.since_id = minId;
    }

    $.get(endpoint, params, function(data) {
	var added = false;
	if (data.length > 0) {
	    for (var i = data.length - 1; i > -1; i--) {
		added = updatePost(data[i]) || added;
	    }
	}
	scrollDown(added);
	$(".easydate").easydate();
    });
    updateUsers();
    globalFeedTimer = setTimeout("updateGlobalFeed()", 2000);
}

function updatePost(data) {
    var added = false;
    if (!document.getElementById("post|" + data.id)) {
	var created = new Date(data.created_at).getTime();
	minId = data.id;
	var annotations = data.annotations;
	var htmlText = null;
	if (annotations != null) {
	    var j = 0;
	    for (; j < annotations.length; ++j) {
		if (annotations[j].type == "snark.chat") {
		    var text = annotations[j].value.message;
		    htmlText = htmlEncode(text);
		    userPostTimes[data.user.username] = created;
		} else if (annotations[j].type == "snark.room") {
		    var text = annotations[j].value.name;
		    htmlText = "<em>Room <strong>"
			+ htmlEncode(text)
			+ "</strong> created</em>";
		    userLiveTimes[data.user.username] = created;
		} else if (annotations[j].type == "snark.keepalive") {
//		    console.log("Found Keepalive From " + data.user.username);
		    userLiveTimes[data.user.username] = created;
		}
	    }
	}
	if (htmlText != null) {
	    var body = htmlText.replace(urlRegex,
					"<a href='$1' target='_blank'>$1</a>");
	    var formattedPost =
		"<div class='row-fluid'><div class='span10'>" +
		"<span class='appNetPostUsername'><strong>@" + 
		data.user.username + "</strong></span> " + body
		+ "</div><div class='span2'><span class='easydate'>" +
		htmlEncode(data.created_at) + "</span></div></div>";
	    $('<div></div>', {
		id: 'post|' + data.id,
		html: formattedPost
	    }).appendTo($("#global-tab-container"));
	    added = true;
	}
    }
    return added;
}

function updateUsers() {
    var userList = '<ul class="unstyled">';
    var goneTime = new Date().getTime() - 1000*60*goneTimeout;
    var idleTime = new Date().getTime() - 1000*60*idleTimeout;
    var keys = Object.keys(userLiveTimes);
    keys.sort();
    var i = 0;
    for (; i < keys.length; ++i) {
	var liveTime = userLiveTimes[keys[i]];
	var postTime = userPostTimes[keys[i]]
	if (liveTime >= goneTime
	    || (postTime != null && postTime >= goneTime)
	    || keys[i] == currentUser.username)
	{
	    var user = htmlEncode(keys[i]);
	    var userClass = "idleUser";
	    if (postTime != null && postTime >= idleTime) {
		userClass = "activeUser";
	    }
	    userList += "<li><span class='" + userClass + "'><strong>@"
		+ user + "</strong></span></li>";
	}
    }
    userList += "</ul>";
    if (userList != lastUserList) {
	$("#user-list").html(userList);
	lastUserList = userList;
    }
}

function postMessage(messageString) {
    var post = {
	machine_only: true,
	reply_to: chatRoom,
	annotations: [{type: "snark.chat", value: {message: messageString}}]
    };
    var endpoint = "https://alpha-api.app.net/stream/0/posts";
    endpoint += "?include_annotations=1";
    jsonPost(endpoint, post, function(data) {
	scrollDown(updatePost(data));
	$(".easydate").easydate();
    });

    $("#main_post").val("");
}

function scrollDown(shouldScroll) {
    if (shouldScroll) {
	var objDiv = document.getElementById("global-tab-container");
	objDiv.scrollTop = objDiv.scrollHeight;
    }
}

function createRoom(name) {
    var post = {
	machine_only: true,
	annotations: [{type: "snark.room", value: {name: name}}]
    };
    var endpoint = "https://alpha-api.app.net/stream/0/posts";
    jsonPost(endpoint, post, function(data) {
	chatRoom = data.thread_id;
	refreshPage();
    });
}

function keepalive() {
    clearTimeout(keepaliveTimer);
    var post = {
	machine_only: true,
	reply_to: chatRoom,
	annotations: [{type: "snark.keepalive", value: {ping: 1}}]
    };
    var endpoint = "https://alpha-api.app.net/stream/0/posts";
    jsonPost(endpoint, post, function(data) {
    });
    keepaliveTimer = setTimeout("keepalive()", 1000 * 60 * keepaliveTimeout);
}

function jsonPost(endpoint, data, success) {
    $.ajax({
	url: endpoint,
	type: "POST",
	contentType: "application/json",
	data: JSON.stringify(data),
	dataType: "json",
	beforeSend: setHeader
    }).done(function(data) {
	success(data);
    }).fail(function(req, status) {
	console.log("jsonPost failed: " + status);
	console.dir(req);
	console.dir(req.getAllResponseHeaders());
    });
}

function logResult(data) {
//    console.dir(JSON.stringify(data));
}

function htmlEncode(value){
    if (value) {
        return jQuery('<div />').text(value).html();
    } else {
        return '';
    }
}
 
function htmlDecode(value) {
    if (value) {
        return $('<div />').html(value).text();
    } else {
        return '';
    }
}

function getHashParams() {

    var hashParams = {};
    var e,
        a = /\+/g,  // Regex for replacing addition symbol with a space
        r = /([^&;=]+)=?([^&;]*)/g,
        d = function (s) { return decodeURIComponent(s.replace(a, " ")); },
        q = window.location.hash.substring(1);

    while (e = r.exec(q))
       hashParams[d(e[1])] = d(e[2]);

    return hashParams;
}

function setHeader(xhr) {
    xhr.setRequestHeader('Authorization', 'Bearer ' + accessToken);
}

function refreshPage() {
    var redirect = "http://www.jonathonduerig.com/patter.html";
    if (chatRoom != null) {
	redirect += "#room=" + chatRoom;
    }
    window.location = redirect;
    window.location.reload(true);
}

var urlRegex = /\b((?:[a-z][\w-]+:(?:\/{1,3}|[a-z0-9%])|www\d{0,3}[.]|[a-z0-9.\-]+[.][a-z]{2,4}\/)(?:[^\s()<>]+|\(([^\s()<>]+|(\([^\s()<>]+\)))*\))+(?:\(([^\s()<>]+|(\([^\s()<>]+\)))*\)|[^\s`!()\[\]{};:'".,<>?«»“”‘’]))/i;
