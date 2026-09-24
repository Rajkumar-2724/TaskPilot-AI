import { useEffect, useState, useContext, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import api from "../services/api.js";
import { SocketContext } from "../context/SocketContext.jsx";

const NotificationBell = () => {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const { notifications } = useContext(SocketContext) || {};
  const bellRef = useRef(null);
  const dropdownRef = useRef(null);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, right: 0 });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/notifications");
      setItems(data.notifications || []);
      setUnread(data.unreadCount || 0);
    } catch (err) {
      console.error("[NotificationBell] Failed to load notifications:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (notifications) {
      const timer = setTimeout(load, 100);
      return () => clearTimeout(timer);
    }
  }, [notifications, load]);

  const updatePosition = useCallback(() => {
    if (bellRef.current) {
      const rect = bellRef.current.getBoundingClientRect();
      setDropdownPos({
        top: rect.bottom + window.scrollY + 8,
        right: window.innerWidth - rect.right,
      });
    }
  }, []);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (
        bellRef.current && !bellRef.current.contains(e.target) &&
        dropdownRef.current && !dropdownRef.current.contains(e.target)
      ) {
        setOpen(false);
      }
    };
    if (open) {
      updatePosition();
      document.addEventListener("mousedown", handleClickOutside);
      window.addEventListener("resize", updatePosition);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("resize", updatePosition);
    };
  }, [open, updatePosition]);

  const markAllRead = async () => {
    try {
      await api.put("/notifications/read-all");
      setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnread(0);
    } catch (err) {
      console.error("[NotificationBell] Failed to mark all as read:", err);
    }
  };

  const markAsRead = async (id) => {
    try {
      await api.put(`/notifications/${id}/read`);
      setItems((prev) =>
        prev.map((n) => (n._id === id ? { ...n, isRead: true } : n))
      );
      setUnread((prev) => Math.max(0, prev - 1));
    } catch (err) {
      console.error("[NotificationBell] Failed to mark as read:", err);
    }
  };

  const dropdown = open ? createPortal(
    <div
      ref={dropdownRef}
      className="tp-glass p-2"
      style={{
        position: "absolute",
        top: dropdownPos.top,
        right: dropdownPos.right,
        width: 320,
        maxHeight: 400,
        overflowY: "auto",
        zIndex: 9999,
      }}
    >
      <div className="d-flex justify-content-between align-items-center px-2 py-1">
        <strong style={{ color: 'var(--tp-text)', fontFamily: '"Plus Jakarta Sans", sans-serif' }}>Notifications</strong>
        <button
          className="btn btn-sm"
          style={{ color: '#38BDF8', background: 'none', border: 'none' }}
          onClick={markAllRead}
        >
          Mark all read
        </button>
      </div>
      {loading && items.length === 0 && (
        <p className="small px-2 text-center" style={{ color: 'var(--tp-text-secondary)' }}>Loading...</p>
      )}
      {!loading && items.length === 0 && (
        <p className="small px-2" style={{ color: 'var(--tp-text-secondary)' }}>No notifications yet.</p>
      )}
      {items.map((n) => (
        <div
          key={n._id}
          className="p-2 rounded mb-1"
          style={{
            background: n.isRead ? 'transparent' : 'rgba(56, 189, 248, 0.08)',
            border: n.isRead ? 'none' : '1px solid rgba(56, 189, 248, 0.15)',
            cursor: n.link ? 'pointer' : 'default',
            transition: 'background 0.2s',
          }}
          onMouseEnter={(e) => {
            if (n.isRead) e.currentTarget.style.background = 'var(--tp-surface-table-hover)';
          }}
          onMouseLeave={(e) => {
            if (n.isRead) e.currentTarget.style.background = 'transparent';
          }}
          onClick={() => {
            if (!n.isRead) markAsRead(n._id);
            if (n.link) {
              window.location.href = n.link;
              setOpen(false);
            }
          }}
        >
          <div className="small fw-semibold" style={{ color: 'var(--tp-text)' }}>{n.type}</div>
          <div className="small" style={{ color: 'var(--tp-text-secondary)' }}>{n.message}</div>
          {n.createdAt && (
            <div className="small mt-1" style={{ color: 'var(--tp-muted)', fontSize: '0.7rem' }}>
              {new Date(n.createdAt).toLocaleString()}
            </div>
          )}
        </div>
      ))}
    </div>,
    document.body
  ) : null;

  return (
    <div className="position-relative">
      <button
        ref={bellRef}
        className="btn position-relative rounded-circle"
        style={{
          background: 'var(--tp-glass-bg)',
          border: '1px solid var(--tp-glass-border)',
          color: 'var(--tp-text)',
          width: 38,
          height: 38,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        onClick={() => {
          setOpen((o) => !o);
          if (!open) load();
        }}
      >
        <i className="bi bi-bell" />
        {unread > 0 && (
          <span
            className="position-absolute top-0 start-100 translate-middle badge rounded-pill"
            style={{ background: '#EF4444', color: '#fff', fontSize: '0.65rem' }}
          >
            {unread}
          </span>
        )}
      </button>
      {dropdown}
    </div>
  );
};

export default NotificationBell;
