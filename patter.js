// Times in minutes;
var goneTimeout = 10;
var idleTimeout = 5;
var keepaliveTimeout = 9;

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
var earliestId = 2000000000;
var latestId = 0;
var lastUserList = "";

//-----------------------------------------------------------------------------
// Initialization functions
//-----------------------------------------------------------------------------

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
//	    console.log("Current user:");
//	    console.dir(data);
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

//-----------------------------------------------------------------------------
// Update Functions
//-----------------------------------------------------------------------------

function updateGlobalFeed() {
    var chatArea = $("#global-tab-container")[0];
    clearTimeout(globalFeedTimer);

    // Should the feed load older messages or newer ones.
    var goBack = false;
    if (chatArea.scrollTop <= chatArea.scrollHeight/3
	&& $("#global-tab-container").children().length > 0
	&& earliestId > chatRoom) {
	goBack = true;
    }

    endpoint = "https://alpha-api.app.net/stream/0/posts/" + chatRoom
	+ "/replies";

    var params = new Object;
    params.access_token = accessToken;
    params.include_machine = 1;
    params.include_annotations = 1;
    params.count = 200;

    if ($("#global-tab-container").children().length > 0) {
	if (goBack) {
	    params.before_id = earliestId;
	} else {
	    params.since_id = latestId;
	}
    }

    $.get(endpoint, params, function(data) {
	var allPosts = "";
	for (var i = data.length - 1; i > -1; i--) {
	    var newPost = updatePost(data[i], goBack);
	    if (newPost != null) {
		allPosts += newPost;
	    }
	}
	addPosts(allPosts, goBack);
    });
    updateUsers();
    globalFeedTimer = setTimeout("updateGlobalFeed()", 2000);
}

function updatePost(data, goBack) {
    var result = null;
    if (!document.getElementById("post|" + data.id)) {
	var created = new Date(data.created_at).getTime();
	latestId = Math.max(data.id, latestId);
	earliestId = Math.min(data.id, earliestId);
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
	    result =
		"<div class='row-fluid' id='post|" + data.id +
		"'><div class='span10'>" +
		"<span class='appNetPostUsername' "
		+ makeUserColor(data.user.username) + "><strong>@" + 
		data.user.username + "</strong></span> " + body
		+ "</div><div class='span2'><span class='easydate'>" +
		htmlEncode(data.created_at) + "</span></div></div>";
	}
    }
    return result;
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
	if ((liveTime != null && liveTime >= goneTime)
	    || (postTime != null && postTime >= goneTime)
	    || keys[i] == currentUser.username)
	{
	    var user = htmlEncode(keys[i]);
	    var userClass = "idleUser";
	    if (postTime != null && postTime >= idleTime) {
		userClass = "activeUser";
	    }
	    userList += "<li><span class='" + userClass + "' "
		+ makeUserColor(user) + "><strong>@"
		+ user + "</strong></span></li>";
	}
    }
    userList += "</ul>";
    if (userList != lastUserList) {
	$("#user-list").html(userList);
	lastUserList = userList;
    }
}

//-----------------------------------------------------------------------------
// Post Functions
//-----------------------------------------------------------------------------

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

function postMessage(messageString) {
    var post = {
	machine_only: true,
	reply_to: chatRoom,
	annotations: [{type: "snark.chat", value: {message: messageString}}]
    };
    var endpoint = "https://alpha-api.app.net/stream/0/posts";
    endpoint += "?include_annotations=1";
    jsonPost(endpoint, post, function(data) {
	addPosts(updatePost(data), false);
    });

    $("#main_post").val("");
}

function keepalive() {
//    clearTimeout(keepaliveTimer);
    var post = {
	machine_only: true,
	reply_to: chatRoom,
	annotations: [{type: "snark.keepalive", value: {ping: 1}}]
    };
    var endpoint = "https://alpha-api.app.net/stream/0/posts";
    jsonPost(endpoint, post, function(data) {});
//    keepaliveTimer = setTimeout("keepalive()", 1000 * 60 * keepaliveTimeout);
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

//-----------------------------------------------------------------------------
// Utility functions
//-----------------------------------------------------------------------------

function addPosts(posts, addBefore)
{
    if (posts != "") {
	var chatArea = document.getElementById("global-tab-container");
	var oldHeight = chatArea.scrollHeight;
	var oldClient = chatArea.clientHeight;
	var oldTop = chatArea.scrollTop;
	if (addBefore) {
	    $("#global-tab-container").prepend(posts);
	    $(".easydate").easydate();
	    chatArea.scrollTop = oldTop + chatArea.scrollHeight - oldHeight;
	} else {
	    $("#global-tab-container").append(posts);
	    $(".easydate").easydate();
	    var oldBottom = Math.max(oldHeight, oldClient) - oldClient;
	    if (oldTop == oldBottom) {
		chatArea.scrollTop = Math.max(chatArea.scrollHeight,
					      chatArea.clientHeight)
		    - chatArea.clientHeight;
	    }
	    $.titleAlert("New Message", { duration: 10000,
					  interval: 1000,
					  requireBlur: true});
	}
    }
}

function scrollDown(shouldScroll, lastBottom) {
    if (shouldScroll) {
	var chatArea = document.getElementById("global-tab-container");
	if (chatArea.scrollTop == lastBottom) {
	    chatArea.scrollTop = getBottomScroll();
	}
	$.titleAlert("New Message", { duration: 10000,
				      interval: 1000,
				      requireBlur: true});
    }
}

function getBottomScroll() {
    var chatArea = document.getElementById("global-tab-container");
    var scroll = chatArea.scrollHeight;
    var client = chatArea.clientHeight;
    return Math.max(scroll, client) - client;
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
    var redirect = "http://patter-app.net/chat";
    if (chatRoom != null) {
	redirect += "#room=" + chatRoom;
    }
    window.location = redirect;
    window.location.reload(true);
}

function makeUserColor(user) {
    var hash = getHash(user);
    var color = (hash & 0x007f7f7f).toString(16);
    return "style='color: #" + color + "'";
}

function getHash(str) {
    var hash = 0;
    if (str.length == 0) return hash;
    var i = 0;
    for (; i < str.length; i++) {
        var char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return hash;
};

var urlRegex = /\b((?:[a-z][\w-]+:(?:\/{1,3}|[a-z0-9%])|www\d{0,3}[.]|[a-z0-9.\-]+[.][a-z]{2,4}\/)(?:[^\s()<>]+|\(([^\s()<>]+|(\([^\s()<>]+\)))*\))+(?:\(([^\s()<>]+|(\([^\s()<>]+\)))*\)|[^\s`!()\[\]{};:'".,<>?«»“”‘’]))/i;
