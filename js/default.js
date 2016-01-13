/*
//  default.js
//  Digital Signage
//
//  Created by Micah Bucy on 1/11/2016.
//  Copyright © 2016 Micah Bucy. All rights reserved.
//
//  The MIT License (MIT)
//  This file is subject to the terms and conditions defined in LICENSE.md
*/
(function () {
    "use strict";

    var alert = function (message, callback) {
        vex.defaultOptions.className = "vex-theme-os";
        if (typeof callback === 'function') {
            vex.dialog.alert({ message: message, callback: callback });
        }
        else {
            vex.dialog.alert(message);
        }
    };
    var app = WinJS.Application;
    var activation = Windows.ApplicationModel.Activation;
    var ViewManagement = Windows.UI.ViewManagement;
    var FullScreenSystemOverlayMode = ViewManagement.FullScreenSystemOverlayMode;
    var ApplicationView = ViewManagement.ApplicationView;
    var cursorPositionX = 0;
    var cursorPositionY = 0;
    var initializing = true;
    var slideshowLoader = [];
    var slideshow = [];
    var countdowns = [];
    var currentSlide = 0;
    var loadedJSON = "";
    var mouseTimer;
    var updateTimer;
    var countdownTimer;
    var timer;
    var loading = false;
    var updateReady = false;
    var Item = WinJS.Class.define(
	    function (uri, type, filename, localUri) {
	        this.uri = uri;
	        this.type = type;
	        this.filename = filename;
	        this.localUri = localUri;
	        this.status = 0;
	    },
        {
            generateItemHTML: function () {
                var $item;
                if (this.type == "image") {
                    $item = $("<img src='" + this.localUri + "' />");
                }
                if (this.type == "video") {
                    $item = $("<video src='" + this.localUri + "'></video>");
                }
                return $item;
            }
        },
        {}
	);
    var Countdown = WinJS.Class.define(
        function (day, hour, minute, duration) {
            this.day = day;
            this.hour = hour;
            this.minute = minute;
            this.duration = duration;
        },
        {},
        {}
    );

    app.downloadItem = function (item) {
        var filename = item.filename;
        if (updateTimer == undefined) {
            console.log("updateTimer is undefined, aborting download of " + filename);
            return;
        }
        Windows.Storage.ApplicationData.current.localFolder.createFileAsync(filename).done(function (file) {
            var downloader = new Windows.Networking.BackgroundTransfer.BackgroundDownloader();
            var download = downloader.createDownload(item.uri, file).startAsync().done(function (file) {
                item.status = 1;
            });
        });
    };

    app.loadItem = function (item) {
        var filename = item.filename;
        if (updateTimer == undefined) {
            console.log("updateTimer is undefined, aborting loading " + filename);
            return;
        }
        if (item.status == 1) {
            console.log(filename + " already exists, skipping download.");
            return;
        }
        var backgroundDownloader = new Windows.Networking.BackgroundTransfer.BackgroundDownloader();
        Windows.Storage.ApplicationData.current.localFolder.tryGetItemAsync(filename).done(function (file) {
            if (file !== null) {
                file.deleteAsync().done(function () {
                    app.downloadItem(item);
                });
            }
            else {
                app.downloadItem(item);
            }
        });
    };

    app.loadNextSlide = function () {
        if (initializing || slideshow.length == 0) {
            currentSlide = 0;
            timer = setTimeout(app.loadNextSlide, 5000);
            return;
        }
        var $slideshow = $("#slideshow");
        var item;
        if (updateReady) {
            app.reloadSlideshow();
        }
        item = slideshow[currentSlide];
        currentSlide = (currentSlide + 1) % slideshow.length;
        var $item = item.generateItemHTML();
        $slideshow.append($item);
        if (item.type == "video") {
            $item.on("ended", function () {
                app.loadNextSlide();
            });
            app.scaleToFill($item);
            $item[0].play();
            $item[0].pause();
        }
        $item.transition({ opacity: 1 }, 1000, "linear", function () {
            if ($slideshow.children().length > 1) {
                $slideshow.children().first().remove();
            }
            if (item.type == "image") {
                timer = setTimeout(app.loadNextSlide, 5000);
            }
            else {
                $item[0].play();
            }
        });
    };
    
    app.scaleToFill = function($video) {
        var videoRatio = 16/9;
        var tagRatio = $video.width() / $video.height();
        if (videoRatio < tagRatio) {
            $video.css('transform','scaleX(' + tagRatio / videoRatio  + ')');
        }
        else if (tagRatio < videoRatio) {
            $video.css('transform', 'scaleY(' + videoRatio / tagRatio + ')');
        }
    };

    app.reloadSlideshow = function () {
        if (updateTimer == undefined) {
            console.log("updateTimer is undefined, not reloading show");
            return;
        }
        slideshow = slideshowLoader;
        slideshowLoader = [];
        currentSlide = 0;
        if (initializing) {
            initializing = false;
            app.loadNextSlide();
        }
        loading = false;
        updateReady = false;
    };

    app.checkLoadStatus = function () {
        var finished = true;
        $.each(slideshowLoader, function () {
            if (this.status == 0) {
                finished = false;
                return false;
            }
        });
        if (!finished) {
            setTimeout(app.checkLoadStatus, 100);
        }
        else {
            var appData = Windows.Storage.ApplicationData.current;
            var localFolder = appData.localFolder;
            var currentLoader = slideshowLoader;
            localFolder.getFilesAsync().done(function (files) {
                files.forEach(function forEachFile(file) {
                    var filename = file.name;
                    if (filename == "json.txt") {
                        return;
                    }
                    var remove = true;
                    $.each(currentLoader, function () {
                        if (filename == this.filename) {
                            remove = false;
                            return false;
                        }
                    });
                    if (remove) {
                        file.deleteAsync().done(function () {
                            console.log("removed " + filename);
                        });
                    }
                });
            });
            if (initializing) {
                console.log("Initializing");
                app.reloadSlideshow();
            }
            else {
                console.log("Update is ready.");
                updateReady = true;
            }
        }
    };

    app.writeJSON = function (text, json) {
        var appData = Windows.Storage.ApplicationData.current;
        var localFolder = appData.localFolder;
        localFolder.createFileAsync("json.txt", Windows.Storage.CreationCollisionOption.replaceExisting).then(function (file) {
            if (file !== null) {
                Windows.Storage.FileIO.writeTextAsync(file, text).done(function () {
                    loadedJSON = text;
                    app.loadCountdowns(json);
                    app.loadItems(json);
                });
            }
        });
    };

    app.readJSON = function () {
        var applicationData = Windows.Storage.ApplicationData.current;
        var localFolder = applicationData.localFolder;
        Windows.Storage.ApplicationData.current.localFolder.tryGetItemAsync("json.txt").done(function (file) {
            Windows.Storage.FileIO.readTextAsync(file).done(function (text) {
                try {
                    var data = JSON.parse(text);
                    loadedJSON = text;
                    app.loadCountdowns(data);
                    app.loadItems(data);
                } catch (Exception) {
                    alert("Cached json is corrupt.");
                }
            });
        }, function (error) {
            alert("Offline and no cache.");
        });
    };

    app.loadItems = function (data) {
        $.each(data.items, function () {
            if (updateTimer == undefined) {
                console.log("updateTimer is undefined, aborting current loading of items.");
                return false;
            }
            var path;
            var url = this.url;
            var filename = url.substring(url.lastIndexOf('/') + 1);
            var server_md5sum = this.md5sum;
            var uri;
            try {
                uri = new Windows.Foundation.Uri(url);
            }
            catch (Exception) {
                console.log("malformed url");
                return;
            }
            if (uri.schemeName != "https") {
                console.log("url must be using https");
                return;
            }
            var path = Windows.Storage.ApplicationData.current.localFolder.path + "\\" + filename;
            var item = new Item(uri, this.type, filename, path);
            slideshowLoader.push(item);
            var length = slideshowLoader.length
            Windows.Storage.ApplicationData.current.localFolder.tryGetItemAsync(filename).done(function (file) {
                if (updateTimer == undefined) {
                    console.log("updateTimer is undefined, no need to load items.");
                    return;
                }
                var item = slideshowLoader[length - 1];
                if (file !== null) {
                    var hashProvider = Windows.Security.Cryptography.Core.HashAlgorithmProvider.openAlgorithm(Windows.Security.Cryptography.Core.HashAlgorithmNames.md5);
                    Windows.Storage.FileIO.readBufferAsync(file).then(
                        function (buffer) {
                            if (updateTimer == undefined) {
                                console.log("updateTimer is undefined, no need to verify existing item.");
                                return;
                            }
                            var outputBuffer = hashProvider.hashData(buffer);
                            var md5sum = Windows.Security.Cryptography.CryptographicBuffer.encodeToHexString(outputBuffer);
                            if (md5sum != server_md5sum) {
                                app.loadItem(item);
                            }
                            else {
                                item.status = 1;
                                app.loadItem(item);
                            }
                        }
                    );
                }
                else {
                    app.loadItem(item);
                }
            });
        });
        if (updateTimer == undefined) {
            console.log("updateTimer is undefined, no need to check current load status.");
            return;
        }
        setTimeout(app.checkLoadStatus, 100);
    };

    app.loadCountdowns = function (data) {
        countdowns = [];
        if (data.hasOwnProperty("countdowns")) {
            $.each(data.countdowns, function () {
                var countdown = new Countdown(this.day, this.hour, this.minute, this.duration);
                countdowns.push(countdown);
            });
            if (countdownTimer == undefined) {
                countdownTimer = setInterval(app.updateCountdown, 100);
            }
        }
    }

    app.ToggleFullscreen = function () {
        var view = ApplicationView.getForCurrentView();
        if (!view.isFullScreen) {
            view.tryEnterFullScreenMode();
        }
        else {
            view.exitFullScreenMode();
        }
    };

    app.toHHMMSS = function (value) {
        var sec_num = parseInt(value, 10); // don't forget the second param
        var hoursInt = Math.floor(sec_num / 3600);
        var minutes = Math.floor((sec_num - (hoursInt * 3600)) / 60);
        var seconds = sec_num - (hoursInt * 3600) - (minutes * 60);
        var hours;

        if (hoursInt < 10) { hours = "0" + hoursInt + ":"; }
        else { hoursInt = hoursInt + ":"; }
        if (hoursInt < 1) { hours = ""; }
        if (minutes < 10) { minutes = "0" + minutes; }
        if (seconds < 10) { seconds = "0" + seconds; }
        var time = hours + minutes + ':' + seconds;
        return time;
    };

    app.updateCountdown = function () {
        var now = new Date();
        // javascript day of week starts at 0 instead of 1
        var day = now.getDay() + 1;
        var seconds = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
        var hide = true;
        var $countdown = $("#countdown");
        $.each(countdowns, function () {
            var countdown = this;
            if (day != countdown.day) {
                return true;
            }
            var countdownSeconds = countdown.hour * 3600 + countdown.minute * 60;
            var difference = countdownSeconds - seconds;
            var duration = countdown.duration * 60;
            if (difference > 0 && difference < duration) {
                hide = false;
                $countdown.html(app.toHHMMSS(difference));
                return false;
            }
        });
        if (hide) {
            $countdown.hide();
        }
        else {
            $countdown.show();
        }
    };

    app.loadJSON = function (url) {
        // check if still processing the last load request and return if so
        if (loading) {
            return;
        }
        loading = true;
        var uri;
        try {
            uri = new Windows.Foundation.Uri(url);
        }
        catch (Exception) {
            alert("url is malformed", function (value) {
                $("#addressBox").focus();
            });
            return;
        }
        if (uri.schemeName != "https") {
            alert("only https is supported", function (value) {
                $("#addressBox").focus();
            });
            return;
        }
        var httpClient = new Windows.Web.Http.HttpClient();
        httpClient.defaultRequestHeaders.userAgent.parseAdd("Digital Signage");
        httpClient.getStringAsync(uri).then(
            function (response) {
                try {
                    var json = JSON.parse(response);
                    $("#form").hide();
                    if (updateTimer == undefined) {
                        console.log("Setting updateTimer.");
                        updateTimer = setInterval(app.loadJSON, 30000, url);
                    }
                }
                catch (e) {
                    alert("Could not parse response as JSON", function (value) {
                        $("#form").show();
                        $("#addressBox").focus();
                    });
                    return;
                }
                var appData = Windows.Storage.ApplicationData.current.localSettings;
                appData.values["url"] = url;
                if (loadedJSON == "") {
                    return app.writeJSON(response, json);
                }
                if (!initializing && loadedJSON == response) {
                    console.log("No changes.");
                    loading = false;
                    return;
                }
                console.log("loading changes");
                app.writeJSON(response, json);
            },
            function (error) {
                if (loadedJSON == "") {
                    app.readJSON();
                }
                else {
                    loading = false;
                }
            }
        );
    };
    
    app.hideCursor = function () {
        $("body").addClass("hideCursor");
    };

    app.reset = function () {
        console.log("Resetting app");
        initializing = true;
        loading = false;
        updateTimer = clearInterval(updateTimer);
        if (countdownTimer != undefined) {
            countdownTimer = clearInterval(countdownTimer);
        }
        $("#countdown").hide();
        $("#slideshow").children().each(function () {
            $(this).remove();
        });
        $("#form").show();
        $("#addressBox").focus();
    };

    app.loadAddress = function () {
        if (timer != undefined) {
            clearTimeout(timer);
        }
        app.loadJSON($("#addressBox")[0].value);
    };

    app.onactivated = function (args) {
        if (args.detail.kind === activation.ActivationKind.launch) {
            var view = ApplicationView.getForCurrentView();
            if (!view.isFullScreen) {
                view.tryEnterFullScreenMode();
            }
            var appData = Windows.Storage.ApplicationData.current.localSettings;
            $("#countdown").hide();
            $("#goButton").on("click", function(e) {
                app.loadAddress();
            });
            $("#addressBox").on("keydown", function (e) {
                if (e.keyCode == 13) {
                    e.preventDefault();
                    app.loadAddress();
                }
            });
            if (appData.values["url"]) {
                var url = appData.values["url"];
                $("#addressBox").val(url);
                app.loadAddress();
            }

            $("body").on("keyup", function (e) {
                switch (e.keyCode) {
                    case 122: {
                        app.ToggleFullscreen();
                    }
                    case 76: {
                        if (e.ctrlKey) {
                            app.reset();
                        }
                    }
                }
            });
            $(window).on("resize", function (e) {
                $("video").each(function () {
                    app.scaleToFill($(this));
                });
            });
            mouseTimer = setTimeout(app.hideCursor, 5000);
            $("body").on("mousemove", function (e) {
                if (e.pageX != cursorPositionX || e.pageY != cursorPositionY) {
                    cursorPositionX = e.pageX;
                    cursorPositionY = e.pageY;
                    if (mouseTimer != undefined) {
                        mouseTimer = clearTimeout(mouseTimer);
                    }
                    mouseTimer = setTimeout(app.hideCursor, 5000);
                    $(this).removeClass("hideCursor");
                }
            });
            args.setPromise(WinJS.UI.processAll());
        }
    };

    app.oncheckpoint = function (args) {
    };

    app.start();
})();