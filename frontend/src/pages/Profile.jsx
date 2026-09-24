import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import api from "../services/api.js";
import { toast } from "react-toastify";
import { motion } from "framer-motion";

const Profile = () => {
  const { user, updateUser } = useAuth();
  const [form, setForm] = useState({ name: "", bio: "", phone: "" });
  const [pwForm, setPwForm] = useState({ currentPassword: "", newPassword: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user) {
      setForm({ name: user.name || "", bio: user.bio || "", phone: user.phone || "" });
    }
  }, [user]);

  const saveProfile = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { data } = await api.put("/auth/profile", form);
      updateUser(data.user);
      toast.success("Profile updated");
    } catch (err) {
      toast.error(err.response?.data?.message || "Update failed");
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async (e) => {
    e.preventDefault();
    try {
      await api.put("/auth/change-password", pwForm);
      toast.success("Password changed");
      setPwForm({ currentPassword: "", newPassword: "" });
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to change password");
    }
  };

  const uploadPicture = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("image", file);
    try {
      const { data } = await api.post("/auth/upload-profile", fd);
      updateUser(data.user);
      toast.success("Profile picture updated");
    } catch (err) {
      toast.error(err.response?.data?.message || "Upload failed");
    }
  };

  const containerVariants = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.1 } } };
  const itemVariants = { hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4 } } };

  return (
    <motion.div className="row g-3" variants={containerVariants} initial="hidden" animate="visible">
      <div className="col-md-4">
        <motion.div className="tp-glass p-4 text-center" variants={itemVariants}>
          <img
            src={user?.profilePicture || `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.name || "U")}&background=0D1328&color=38BDF8&bold=true&size=128`}
            className="rounded-circle mb-3" style={{ width: 100, height: 100, objectFit: "cover", border: '3px solid rgba(56, 189, 248, 0.3)', boxShadow: '0 0 20px rgba(56, 189, 248, 0.15)' }} alt="" />
          <h5 className="fw-bold mb-0" style={{ color: 'var(--tp-text)', fontFamily: '"Plus Jakarta Sans", sans-serif' }}>{user?.name}</h5>
          <p className="small" style={{ color: '#94A3B8' }}>{user?.role}</p>
          <label className="tp-btn-primary d-inline-block" style={{ cursor: "pointer", borderRadius: 12 }}>
            Change Photo <input type="file" accept="image/*" hidden onChange={uploadPicture} />
          </label>
        </motion.div>
      </div>
      <div className="col-md-8">
        <motion.div className="tp-glass p-4 mb-3" variants={itemVariants}>
          <h6 className="fw-bold mb-3" style={{ fontFamily: '"Plus Jakarta Sans", sans-serif', color: 'var(--tp-text)' }}>Profile Details</h6>
          <form onSubmit={saveProfile}>
            <div className="mb-3"><label className="form-label">Name</label>
              <input className="form-control" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="mb-3"><label className="form-label">Bio</label>
              <textarea className="form-control" rows={2} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} /></div>
            <div className="mb-3"><label className="form-label">Phone</label>
              <input className="form-control" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <button type="submit" className="tp-btn-primary" disabled={saving} style={{ borderRadius: 12 }}>{saving ? "Saving..." : "Save Changes"}</button>
          </form>
        </motion.div>
        <motion.div className="tp-glass p-4" variants={itemVariants}>
          <h6 className="fw-bold mb-3" style={{ fontFamily: '"Plus Jakarta Sans", sans-serif', color: 'var(--tp-text)' }}>Change Password</h6>
          <form onSubmit={changePassword}>
            <div className="mb-3"><label className="form-label">Current Password</label>
              <input type="password" className="form-control" value={pwForm.currentPassword} onChange={(e) => setPwForm({ ...pwForm, currentPassword: e.target.value })} /></div>
            <div className="mb-3"><label className="form-label">New Password</label>
              <input type="password" className="form-control" minLength={6} value={pwForm.newPassword} onChange={(e) => setPwForm({ ...pwForm, newPassword: e.target.value })} /></div>
            <button type="submit" className="tp-btn-primary" style={{ borderRadius: 12 }}>Update Password</button>
          </form>
        </motion.div>
      </div>
    </motion.div>
  );
};

export default Profile;
