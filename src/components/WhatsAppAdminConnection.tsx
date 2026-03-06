import React, { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { QrCode, Smartphone, Wifi, Loader2, CheckCircle2, RotateCcw } from 'lucide-react';

export const WhatsAppAdminConnection = () => {
    const [socket, setSocket] = useState<Socket | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    const [isReady, setIsReady] = useState(false);
    const [qrCode, setQrCode] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        // Connect to the backend
        const newSocket = io(import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001', {
          transports: ['polling', 'websocket'],
          upgrade: true,
          reconnectionAttempts: 10,
          timeout: 30000,
        });
        setSocket(newSocket);

        newSocket.on('connect', () => {
            console.log('Admin connected to backend WS');
            setIsConnected(true);
            setError(null);
        });

        newSocket.on('disconnect', () => {
            console.log('Admin disconnected from backend WS');
            setIsConnected(false);
            setIsReady(false);
        });

        newSocket.on('qr', (qr: string) => {
            console.log('Admin received QR');
            setQrCode(qr);
            setIsReady(false);
        });

        newSocket.on('ready', () => {
            console.log('WhatsApp is ready');
            setIsReady(true);
            setQrCode(null);
            setError(null);
        });

        newSocket.on('authenticated', () => {
            console.log('WhatsApp is authenticated');
        });

        newSocket.on('error', (err: string) => {
            console.error("WhatsApp Engine Error:", err);
            setError(err);
        });

        return () => {
            newSocket.disconnect();
        };
    }, []);

    const handleRestart = () => {
        if (socket) {
            // You could emit a custom 'restart' event here if you implemented it in server.js
            // For now, we rely on the server handling disconnections automatically to regen QRs.
            window.location.reload();
        }
    }

    return (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden mt-8">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center space-x-4">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center ${isReady ? 'bg-emerald-100 text-emerald-600' : 'bg-indigo-100 text-indigo-600'}`}>
                        <Smartphone size={24} />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-slate-800">WhatsApp Engine Connection</h2>
                        <p className="text-sm text-slate-500">Connect the company WhatsApp number to the platform.</p>
                    </div>
                </div>
                <div className="flex items-center space-x-2">
                    {!isConnected && <span className="flex items-center text-xs font-medium text-amber-600 bg-amber-50 px-3 py-1.5 rounded-full"><Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> Connecting...</span>}
                    {isConnected && !isReady && <span className="flex items-center text-xs font-medium text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-full"><Wifi className="w-3 h-3 mr-1.5" /> Waiting for link...</span>}
                    {isReady && <span className="flex items-center text-xs font-medium text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-full"><CheckCircle2 className="w-3 h-3 mr-1.5" /> Connected & Active</span>}
                </div>
            </div>

            <div className="p-8 flex flex-col items-center justify-center min-h-[300px]">
                {error ? (
                    <div className="flex flex-col items-center max-w-sm text-center">
                        <div className="p-4 bg-red-100 text-red-600 rounded-full mb-4">
                            <RotateCcw size={32} />
                        </div>
                        <h3 className="text-lg font-bold text-slate-800 mb-2">Engine Error</h3>
                        <p className="text-sm text-slate-500 mb-6">{error}</p>
                        <button onClick={handleRestart} className="px-6 py-2 bg-slate-900 text-white rounded-xl font-medium text-sm hover:bg-slate-800 transition-colors">Restart Engine</button>
                    </div>
                ) : !isConnected ? (
                    <div className="flex flex-col items-center max-w-sm text-center text-slate-400">
                        <Loader2 className="w-10 h-10 animate-spin mb-4" />
                        <p className="text-sm">Connecting to backend server...</p>
                    </div>
                ) : isReady ? (
                    <div className="flex flex-col items-center max-w-sm text-center">
                        <div className="p-5 bg-emerald-100/50 text-emerald-600 rounded-full mb-6 border-8 border-emerald-50">
                            <CheckCircle2 size={40} />
                        </div>
                        <h3 className="text-xl font-bold text-slate-800 mb-2">Engine is Active</h3>
                        <p className="text-sm text-slate-500 leading-relaxed mb-6">
                            The WhatsApp connection is established and healthy. Agents can now view and reply to messages in the Inbox.
                        </p>
                    </div>
                ) : qrCode ? (
                    <div className="flex flex-col items-center border border-slate-100 p-8 rounded-3xl bg-slate-50/50 max-w-sm text-center">
                        <div className="mb-6 space-y-2">
                            <h3 className="text-lg font-bold text-slate-800">Scan to link</h3>
                            <p className="text-sm text-slate-500 leading-relaxed">Open WhatsApp on your phone, navigate to <b>Linked Devices</b>, and scan this QR code.</p>
                        </div>
                        <div className="p-4 bg-white rounded-2xl shadow-sm border border-slate-100">
                            <img src={qrCode} alt="WhatsApp QR Code" className="w-48 h-48" />
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-col items-center max-w-sm text-center text-slate-400">
                        <Loader2 className="w-10 h-10 animate-spin mb-4" />
                        <p className="text-sm">Initializing WhatsApp Web Engine... Generating QR code.</p>
                    </div>
                )}
            </div>
        </div>
    );
};
