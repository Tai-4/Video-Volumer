class MediaState {
    static defaultVolume = 1.0;
    static defaultSpeed = 1.0;
    static defaultPan = 0.0;

    static minVolumeLimit = 0.0;
    static minPanLimit = -1.0;
    static maxPanLimit = 1.0;
    static minSpeedLimit = 0.0;
    static maxSpeedLimit = 16.0;

    constructor(volume, speed, pan) {
        volume = parseFloat(volume);
        speed = parseFloat(speed);
        pan = parseFloat(pan);

        if (isNaN(volume)) volume = MediaState.defaultVolume;
        if (isNaN(speed)) speed = MediaState.defaultSpeed;
        if (isNaN(pan)) pan = MediaState.defaultPan;

        if (volume < MediaState.minVolumeLimit) volume = MediaState.minVolumeLimit;
        if (speed < MediaState.minSpeedLimit) speed = MediaState.minSpeedLimit;
        if (speed > MediaState.maxSpeedLimit) speed = MediaState.maxSpeedLimit;
        if (pan < MediaState.minPanLimit) pan = MediaState.minPanLimit;
        if (pan > MediaState.maxPanLimit) pan = MediaState.maxPanLimit;

        this.volume = volume;
        this.speed = speed;
        this.pan = pan;
    }

    copy(data) {
        return new MediaState(
            data.volume == undefined ? this.volume : data.volume,
            data.speed == undefined ? this.speed : data.speed,
            data.pan == undefined ? this.pan : data.pan
        );
    }

    equals(other) {
        return this.volume == other.volume && this.speed == other.speed && this.pan == other.pan;
    }
}

class MediaStateStore extends EventTarget {
    _mediaState = new MediaState();

    get state() { return this._mediaState; }

    _update(mediaState) {
        if (this._mediaState.equals(mediaState)) {
            return;
        }

        this._mediaState = mediaState;
        this.dispatchEvent(new CustomEvent('onMediaStateChange', { detail: { newState: this.state } }));
    }

    updateVolume(volume) {
        const newState = this._mediaState.copy({ volume: volume });
        if (this.state != newState) {
            this._update(newState);
            this.dispatchEvent(new CustomEvent('onMediaVolumeChange', { detail: { newVolume: volume } }));
        }
    }

    updateSpeed(speed) {
        const newState = this._mediaState.copy({ speed: speed });
        if (this.state != newState) {
            this._update(newState);
            this.dispatchEvent(new CustomEvent('onMediaSpeedChange', { detail: { newSpeed: speed } }));
        }
    }

    updatePan(pan) {
        const newState = this._mediaState.copy({ pan: pan });
        if (this.state != newState) {
            this._update(newState);
            this.dispatchEvent(new CustomEvent('onMediaPanChange', { detail: { newPan: pan } }));
        }
    }
}

class YoutubeSpeedControllerElement {

    constructor(mediaStateStore, clickCallback, dblClickCallback, wheelCallback) {
        this._mediaStateStore = mediaStateStore;
        this._clickCallback = clickCallback;
        this._dblClickCallback = dblClickCallback;
        this._wheelCallback = wheelCallback;
        this._onMediaSpeedChangeListener = (event) => {
            this._drawCurrentMediaSpeed(event.detail.newSpeed);
        };
    }

    inject(targetElement) {
        if (!targetElement) {
            return null;
        }

        const controller = this._createControllerElement(
            this._formatSpeedText(this._mediaStateStore.state.speed)
        );
        targetElement.insertAdjacentElement('beforeend', controller);

        controller.addEventListener('click', () => {
            this._clickCallback();
        });
        controller.addEventListener('dblclick', () => {
            this._dblClickCallback();
        });
        controller.addEventListener('wheel', (event) => {
            event.preventDefault();
            this._wheelCallback(event.deltaY);
        })

        this._mediaStateStore.addEventListener('onMediaSpeedChange', this._onMediaSpeedChangeListener);
        return controller;
    }

    remove() {
        const controller = document.getElementById('mc-speed-controller');
        if (!controller) {
            return;
        }

        const frame = controller.parentElement.parentElement;
        if (frame) {
            frame.remove();
        }
        this._mediaStateStore.removeEventListener('onMediaSpeedChange', this._onMediaSpeedChangeListener);
    }

    _formatSpeedText(speed) {
        return `${speed.toFixed(1)}x`;
    }

    _drawCurrentMediaSpeed(speed) {
        const controller = document.getElementById('mc-speed-controller');
        const speedText = controller.querySelector('.ytSpecButtonShapeNextButtonTextContent');
        speedText.textContent = this._formatSpeedText(speed);
    }

    _createControllerElement(speedText) {
        const originalButton = document.querySelector('ytd-menu-renderer yt-button-view-model');
        if (!originalButton) {
            return null;
        }

        const controller = originalButton.cloneNode(true);
        controller.id = 'mc-speed-controller';

        const buttonElement = controller.querySelector('button');
        if (buttonElement) {
            buttonElement.setAttribute('aria-label', "Speed Controller");
            buttonElement.removeAttribute('title');
            buttonElement.classList.remove('ytSpecButtonShapeNextIconLeading');
        }
        const iconWrapper = controller.querySelector('.ytSpecButtonShapeNextIcon');
        if (iconWrapper) {
            iconWrapper.remove();
        }
        const textElement = controller.querySelector('.ytSpecButtonShapeNextButtonTextContent');
        if (textElement) {
            textElement.textContent = speedText;
        }

        return controller;
    }
}

class EmptySpeedControllerElement {
    inject() {}
    remove() {}
}

class SpeedControllerElementFactory {
    static emptySpeedController = new EmptySpeedControllerElement();

    static getSpeedControllerElementForHost(hostName, mediaStateStore, clickCallback, dblClickCallback, wheelCallback) {
        if (hostName.endsWith('youtube.com')) {
            return new YoutubeSpeedControllerElement(mediaStateStore, clickCallback, dblClickCallback, wheelCallback);
        }
        return this.emptySpeedController;
    }
}

class EmptyUIAdapter {
    run() {}
}

class YoutubeUIAdapter {
    run(speedControllerElement) {
        window.addEventListener('yt-page-data-updated', async () => {
            if (this._isWatchPage()) {
                const injectTarget = await this._getSpeedControllerInjectTargetAsync();
                speedControllerElement.inject(injectTarget);
            } else {
                speedControllerElement.remove();
            }
        });
    }

    _getSpeedControllerInjectTarget() {
        // There are many elements which have #top-level-buttons-computed.
        // Only the element within ytd-watch-metadata are required.
        return document.querySelector('ytd-watch-metadata #top-level-buttons-computed');
    }

    _getSpeedControllerInjectTargetAsync() {
        return new Promise((resolve) => {
            const checkInterval = setInterval(() => {
                const target = this._getSpeedControllerInjectTarget();
                if (target) {
                    clearInterval(checkInterval);
                    resolve(target);
                }
            }, 100);
        });
    }

    _isWatchPage() {
        const url = new URL(window.location.href);
        return url.pathname === '/watch'
    }
}

class AdapterFactory {
    static emptyUIAdapter = new EmptyUIAdapter();

    static getAdapterForHost(hostName) {
        if (hostName.endsWith('youtube.com')) {
            return new YoutubeUIAdapter();
        }
        return AdapterFactory.emptyUIAdapter;
    }
}

(() => {
    const mediaStateStore = new MediaStateStore();
    const mediaContext = new (window.AudioContext || window.webkitAudioContext)();
    const shareGainNode = mediaContext.createGain();
    const sharePannerNode = new StereoPannerNode(
        mediaContext,
        { pan: mediaStateStore.state.pan }
    );

    mediaStateStore.addEventListener('onMediaVolumeChange', (event) => {
        chrome.runtime.sendMessage({
            type: "VOLUME_UPDATED",
            value: event.detail.newVolume
        });
    });
    mediaStateStore.addEventListener('onMediaSpeedChange', (event) => {
        chrome.runtime.sendMessage({
            type: "SPEED_UPDATED",
            value: event.detail.newSpeed
        });
    });
    mediaStateStore.addEventListener('onMediaPanChange', (event) => {
        chrome.runtime.sendMessage({
            type: "PAN_UPDATED",
            value: event.detail.newPan
        });
    })

    const mediaElementSourceSet = new WeakSet();
    const createMediaElementSourceIfNeeded = (mediaElements, callback) => {
        mediaElements.forEach((mediaElement) => {
            if (mediaElementSourceSet.has(mediaElement)) {
                return;
            } else {
                const source = mediaContext.createMediaElementSource(mediaElement);
                mediaElementSourceSet.add(mediaElement);
                callback(source);
            }
        });
    };
    const getAllMediaElements = () => {
        const mediaElements = Array.from(document.querySelectorAll("audio, video"));
        const iframes = document.querySelectorAll("iframe");
        iframes.forEach((iframe) => {
            try {
                const iframeDocument = iframe.contentDocument || iframe.contentWindow.document;
                mediaElements.push(...iframeDocument.querySelectorAll("audio, video"));
            } catch (e) {
                // Ignore cross-origin iframe access errors
            }
        });
        return mediaElements;
    }
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        const mediaElements = getAllMediaElements();

        switch (message.request) {
            case "PING":
                sendResponse({ response: "PONG" });
                break;
            case "GET MediaSettings":
                const response = {
                    volume: mediaStateStore.state.volume,
                    speed: mediaStateStore.state.speed,
                    pan: mediaStateStore.state.pan
                };
                sendResponse(response);
                break;
            case "UPDATE MediaVolume":
                createMediaElementSourceIfNeeded(mediaElements, (source) => {
                    source
                        .connect(shareGainNode)
                        .connect(sharePannerNode)
                        .connect(mediaContext.destination);
                });
                mediaStateStore.updateVolume(message.data.volume);
                shareGainNode.gain.value = mediaStateStore.state.volume;
                break;
            case "UPDATE MediaSpeed":
                mediaStateStore.updateSpeed(message.data.speed);
                mediaElements.forEach((mediaElement) => {
                    mediaElement.playbackRate = mediaStateStore.state.speed;
                });
                break;
            case "UPDATE MediaPan":
                createMediaElementSourceIfNeeded(mediaElements, (source) => {
                    source
                        .connect(shareGainNode)
                        .connect(sharePannerNode)
                        .connect(mediaContext.destination);
                });
                mediaStateStore.updatePan(message.data.pan);
                sharePannerNode.pan.value = mediaStateStore.state.pan;
                break;
        }
    });

    const speedControllerClickCallback = () => {
        mediaStateStore.updateSpeed(MediaState.defaultSpeed);
        const mediaElements = getAllMediaElements();
        mediaElements.forEach((mediaElement) => {
            mediaElement.playbackRate = mediaStateStore.state.speed;
        });
    }
    const speedControllerDblClickCallback = () => {
        mediaStateStore.updateSpeed(MediaState.maxSpeedLimit);
        const mediaElements = getAllMediaElements();
        mediaElements.forEach((mediaElement) => {
            mediaElement.playbackRate = mediaStateStore.state.speed;
        });
    }
    const speedControllerWheelCallback = (delta) => {
        let newSpeed = Math.round((mediaStateStore.state.speed - (delta * 0.001)) * 10) / 10;
        if (newSpeed < MediaState.minSpeedLimit) {
            newSpeed = MediaState.minSpeedLimit;
        } else if (newSpeed > MediaState.maxSpeedLimit) {
            newSpeed = MediaState.maxSpeedLimit;
        }

        mediaStateStore.updateSpeed(newSpeed);
        const mediaElements = getAllMediaElements();
        mediaElements.forEach((mediaElement) => {
            mediaElement.playbackRate = mediaStateStore.state.speed;
        });
    };

    const UIAdapter = AdapterFactory.getAdapterForHost(window.location.hostname);
    const speedControllerElement = SpeedControllerElementFactory.getSpeedControllerElementForHost(
        window.location.hostname, mediaStateStore, speedControllerClickCallback, speedControllerDblClickCallback, speedControllerWheelCallback
    );
    UIAdapter.run(speedControllerElement);
})();