// ================================================================
// webrtc-client.js – أساسيات WebRTC لمكالمات الفيديو/الصوت
// RamzApp – يتطلب اتصال Signaling (يمكن دمجه مع Socket.IO)
// ================================================================

let localStream = null;
let peerConnection = null;
const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' } // خادم STUN عام
    ]
};

// عناصر الفيديو (يتم تعيينها من chat.html)
let localVideoElement = null;
let remoteVideoElement = null;

// حالة المكالمة
let isCallActive = false;

// ========== بدء مكالمة ==========
async function startCall() {
    if (isCallActive) return;
    try {
        // 1. الحصول على وسائط المستخدم (كاميرا + ميكروفون)
        localStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
        });

        // عرض الفيديو المحلي
        if (localVideoElement) {
            localVideoElement.srcObject = localStream;
        }

        // 2. إنشاء اتصال الند للند
        peerConnection = new RTCPeerConnection(configuration);

        // إضافة المسارات المحلية للاتصال
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });

        // 3. استقبال المسارات البعيدة
        peerConnection.ontrack = (event) => {
            if (remoteVideoElement && event.streams[0]) {
                remoteVideoElement.srcObject = event.streams[0];
            }
        };

        // 4. معالجة مرشحات ICE وإرسالها للطرف الآخر (عبر Signaling)
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                // أرسل المرشح للطرف الآخر (يحتاج Socket.IO)
                // window.socket.emit('ice-candidate', event.candidate);
                console.log('🧊 مرشح ICE جديد:', event.candidate);
            }
        };

        // 5. إنشاء عرض (offer) وإرساله
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        // أرسل العرض للطرف الآخر (يحتاج Socket.IO)
        // window.socket.emit('call-offer', offer);
        console.log('📞 تم إنشاء العرض (offer)');

        isCallActive = true;
        return { offer, localStream };

    } catch (error) {
        console.error('❌ فشل بدء المكالمة:', error);
        throw error;
    }
}

// ========== استقبال مكالمة (يُستدعى عند وصول عرض) ==========
async function receiveCall(offer) {
    if (isCallActive) return;
    try {
        localStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
        });

        if (localVideoElement) {
            localVideoElement.srcObject = localStream;
        }

        peerConnection = new RTCPeerConnection(configuration);

        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });

        peerConnection.ontrack = (event) => {
            if (remoteVideoElement && event.streams[0]) {
                remoteVideoElement.srcObject = event.streams[0];
            }
        };

        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                // window.socket.emit('ice-candidate', event.candidate);
                console.log('🧊 مرشح ICE (مستقبل):', event.candidate);
            }
        };

        // تعيين العرض المستلم
        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        // أرسل الإجابة للطرف الآخر
        // window.socket.emit('call-answer', answer);
        console.log('📞 تم إرسال الإجابة (answer)');

        isCallActive = true;
        return { answer };

    } catch (error) {
        console.error('❌ فشل استقبال المكالمة:', error);
        throw error;
    }
}

// ========== إضافة مرشح ICE مستلم ==========
async function addIceCandidate(candidate) {
    if (!peerConnection) return;
    try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (error) {
        console.error('❌ فشل إضافة مرشح ICE:', error);
    }
}

// ========== إنهاء المكالمة ==========
function endCall() {
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    if (localVideoElement) localVideoElement.srcObject = null;
    if (remoteVideoElement) remoteVideoElement.srcObject = null;
    isCallActive = false;
    console.log('📵 تم إنهاء المكالمة');
}

// ========== كتم/إلغاء كتم الميكروفون ==========
function toggleMute() {
    if (localStream) {
        const audioTrack = localStream.getAudioTracks()[0];
        if (audioTrack) {
            audioTrack.enabled = !audioTrack.enabled;
            return audioTrack.enabled;
        }
    }
    return null;
}

// ========== تشغيل/إيقاف الفيديو ==========
function toggleVideo() {
    if (localStream) {
        const videoTrack = localStream.getVideoTracks()[0];
        if (videoTrack) {
            videoTrack.enabled = !videoTrack.enabled;
            return videoTrack.enabled;
        }
    }
    return null;
}

// ========== تعيين عناصر الفيديو ==========
function setVideoElements(localId, remoteId) {
    localVideoElement = document.getElementById(localId);
    remoteVideoElement = document.getElementById(remoteId);
}

// ========== تصدير الدوال ==========
window.RamzCall = {
    startCall,
    receiveCall,
    addIceCandidate,
    endCall,
    toggleMute,
    toggleVideo,
    setVideoElements,
    get isCallActive() { return isCallActive; }
};
