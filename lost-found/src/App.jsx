import React, { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import './App.css';

// College official domain restriction
const ALLOWED_DOMAIN = '@adit.ac.in';

export default function App() {
  const [session, setSession] = useState(null);
  const [authMode, setAuthMode] = useState('login'); // 'login' or 'signup'
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState('ALL');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [previewImage, setPreviewImage] = useState(null);

  const [form, setForm] = useState({
    title: '',
    category: 'Electronics',
    type: 'LOST',
    location: '',
    contact_info: '',
    description: '',
    secret_pin: '',
  });
  const [imageFile, setImageFile] = useState(null);

  // Check active user session
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchItems = async () => {
    const { data, error } = await supabase
      .from('items')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error) setItems(data || []);
  };

  useEffect(() => {
    if (session) {
      fetchItems();
    }
  }, [session]);

  // Auth Handler: Login / Signup with Domain Restriction & Email Confirmation
  const handleAuth = async (e) => {
    e.preventDefault();

    const cleanEmail = authEmail.trim().toLowerCase();

    // Check college domain restriction
    if (!cleanEmail.endsWith(ALLOWED_DOMAIN.toLowerCase())) {
      alert(`Access Denied: Only official college email addresses (${ALLOWED_DOMAIN}) are authorized to register or log in.`);
      return;
    }

    if (authPassword.length < 6) {
      alert('Password must be at least 6 characters long.');
      return;
    }

    setAuthLoading(true);

    if (authMode === 'signup') {
      const { data, error } = await supabase.auth.signUp({
        email: cleanEmail,
        password: authPassword,
        options: {
          emailRedirectTo: window.location.origin,
        },
      });

      if (error) {
        alert('Signup Failed: ' + error.message);
      } else if (data?.user && !data?.session) {
        // Email confirmation mandatory hoy tyare session null aavshe
        alert('Verification email sent! Please check your college inbox and confirm your email before signing in.');
        setAuthMode('login');
        setAuthPassword('');
      } else {
        alert('Account created successfully! Welcome to the Campus Portal.');
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password: authPassword,
      });

      if (error) {
        if (error.message.toLowerCase().includes('email not confirmed')) {
          alert('Email not confirmed! Please check your inbox and verify your email before logging in.');
        } else {
          alert('Login Failed: ' + error.message);
        }
      }
    }

    setAuthLoading(false);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setSession(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!form.secret_pin || form.secret_pin.length < 4) {
      alert('Please enter a valid 4 to 6-digit Secret PIN.');
      return;
    }

    setLoading(true);
    let imageUrl = '';

    if (imageFile) {
      const cleanFileName = `${Date.now()}_${imageFile.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
      const { error: uploadError } = await supabase.storage
        .from('item-images')
        .upload(cleanFileName, imageFile, {
          cacheControl: '3600',
          upsert: true,
        });

      if (uploadError) {
        alert('Image Upload Failed: ' + uploadError.message);
        setLoading(false);
        return;
      }

      const { data: publicUrlData } = supabase.storage
        .from('item-images')
        .getPublicUrl(cleanFileName);

      imageUrl = publicUrlData.publicUrl;
    }

    const { error: insertError } = await supabase.from('items').insert([
      { ...form, image_url: imageUrl, is_resolved: false },
    ]);

    if (!insertError) {
      alert('Report published successfully! Please remember your Secret PIN to manage or claim this item.');
      setForm({
        title: '',
        category: 'Electronics',
        type: 'LOST',
        location: '',
        contact_info: '',
        description: '',
        secret_pin: '',
      });
      setImageFile(null);
      const fileInput = document.querySelector('input[type="file"]');
      if (fileInput) fileInput.value = '';
      fetchItems();
    } else {
      alert('Database Insert Error: ' + insertError.message);
    }
    setLoading(false);
  };

  const toggleResolved = async (item) => {
    const actualPin = item.secret_pin ? String(item.secret_pin).trim() : '1234';

    const userEnteredPin = window.prompt(
      `Enter the Secret PIN to mark this item as ${item.is_resolved ? 'Reopened' : 'Claimed'}:`
    );

    if (userEnteredPin === null) return;

    if (userEnteredPin.trim() !== actualPin) {
      alert('Invalid PIN! Only the author who reported this item can update its status.');
      return;
    }

    const newStatus = !item.is_resolved;

    const { error } = await supabase
      .from('items')
      .update({ is_resolved: newStatus })
      .eq('id', item.id);

    if (error) {
      alert('Status Update Failed: ' + error.message);
      return;
    }

    alert(`Item successfully marked as ${newStatus ? 'Claimed' : 'Reopened'}!`);
    await fetchItems();
  };

  const handleWhatsAppChat = (item) => {
    const cleanNumber = item.contact_info.replace(/[^0-9]/g, '');
    const phone = cleanNumber.length === 10 ? `91${cleanNumber}` : cleanNumber;
    const message = encodeURIComponent(
      `Hello! I am reaching out regarding the ${item.type} report for "${item.title}" posted on the Campus Lost & Found Portal.`
    );
    window.open(`https://wa.me/${phone}?text=${message}`, '_blank');
  };

  const filteredItems = items.filter((item) => {
    let matchesType = true;
    if (filter === 'LOST') matchesType = item.type === 'LOST' && !item.is_resolved;
    else if (filter === 'FOUND') matchesType = item.type === 'FOUND' && !item.is_resolved;
    else if (filter === 'CLAIMED') matchesType = item.is_resolved === true;

    const matchesCategory =
      categoryFilter === 'ALL' || item.category === categoryFilter;
    const query = searchQuery.toLowerCase().trim();
    const matchesSearch =
      query === '' ||
      item.title?.toLowerCase().includes(query) ||
      item.location?.toLowerCase().includes(query) ||
      item.description?.toLowerCase().includes(query);

    return matchesType && matchesCategory && matchesSearch;
  });

  // If user is not logged in, show Auth Gate
  if (!session) {
    return (
      <div className="auth-gate-wrapper">
        <div className="auth-card">
          <div className="auth-brand">
            <div className="brand-logo">🎓</div>
            <h2>Campus Lost &amp; Found Portal</h2>
            <p>Student Verification Required</p>
            <div className="domain-pill">Authorized for {ALLOWED_DOMAIN} accounts</div>
          </div>

          <div className="auth-toggle-tabs">
            <button
              className={`auth-tab-btn ${authMode === 'login' ? 'active' : ''}`}
              onClick={() => setAuthMode('login')}
              type="button"
            >
              Student Login
            </button>
            <button
              className={`auth-tab-btn ${authMode === 'signup' ? 'active' : ''}`}
              onClick={() => setAuthMode('signup')}
              type="button"
            >
              New Registration
            </button>
          </div>

          <form onSubmit={handleAuth} className="auth-form">
            <div className="form-group">
              <label>College Email Address</label>
              <input
                type="email"
                className="form-control"
                placeholder={`enrollment${ALLOWED_DOMAIN}`}
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label>Password</label>
              <input
                type="password"
                className="form-control"
                placeholder="Minimum 6 characters"
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                required
              />
            </div>

            <button type="submit" className="btn-submit-glow" disabled={authLoading}>
              {authLoading
                ? 'Authenticating...'
                : authMode === 'login'
                ? 'Sign In to Portal 🚀'
                : 'Create Account 🎓'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Logged-in Student Dashboard
  return (
    <div className="app-wrapper">
      <header className="app-header">
        <div className="brand-section">
          <div className="brand-logo">⚡</div>
          <div className="brand-title">
            <h1>Lost &amp; Found Portal</h1>
            <p>
              Campus Recovery System <span className="ai-tag">VERIFIED STUDENT</span>
            </p>
          </div>
        </div>

        <div className="header-right-auth">
          <div className="user-profile-badge">
            <span className="user-dot"></span>
            <span className="user-email-text" title={session.user.email}>
              {session.user.email}
            </span>
          </div>

          <button className="btn-logout" onClick={handleLogout} title="Sign Out">
            Sign Out ↪
          </button>
        </div>
      </header>

      <main className="content-grid">
        {/* Left Form */}
        <section className="form-card">
          <div className="form-top-title">
            <h2>📢 Report an Item</h2>
          </div>
          <form onSubmit={handleSubmit} className="form-grid-inner">
            <div className="form-row">
              <div className="form-group">
                <label>Status</label>
                <select
                  className="form-control"
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value })}
                >
                  <option value="LOST">🔴 Lost Item</option>
                  <option value="FOUND">🟢 Found Item</option>
                </select>
              </div>

              <div className="form-group">
                <label>Category</label>
                <select
                  className="form-control"
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                >
                  <option value="Electronics">Electronics</option>
                  <option value="ID/Documents">Documents</option>
                  <option value="Bags/Wallets">Wallets/Bags</option>
                  <option value="Keys">Keys</option>
                  <option value="Bottles/Clothing">Clothing</option>
                  <option value="Others">Others</option>
                </select>
              </div>
            </div>

            <div className="form-group">
              <label>Item Name</label>
              <input
                type="text"
                className="form-control"
                placeholder="e.g. Titan Watch, College ID Card"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                required
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Location</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="e.g. Lab 212, Cafeteria"
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label>Contact Info</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="10-digit WhatsApp or Phone"
                  value={form.contact_info}
                  onChange={(e) => setForm({ ...form, contact_info: e.target.value })}
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label>Secret PIN (Claim Verification)</label>
              <input
                type="password"
                maxLength="6"
                className="form-control"
                placeholder="Set 4 to 6-digit PIN (e.g. 1234)"
                value={form.secret_pin}
                onChange={(e) => setForm({ ...form, secret_pin: e.target.value })}
                required
              />
            </div>

            <div className="form-group">
              <label>Description</label>
              <textarea
                className="form-control"
                placeholder="Distinct marks, color, unique stickers or details..."
                rows="2"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label>Item Photo (Optional)</label>
              <div className="file-input-box">
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setImageFile(e.target.files[0])}
                />
              </div>
            </div>

            <button type="submit" className="btn-submit-glow" disabled={loading}>
              {loading ? 'Submitting Report...' : 'Publish Notice 🚀'}
            </button>
          </form>
        </section>

        {/* Right Feed */}
        <section className="feed-section">
          <div className="feed-header-bar">
            <div className="search-input-pill">
              <span className="search-icon-svg">🔍</span>
              <input
                type="text"
                placeholder="Search items by name, department, or keywords..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="filter-row">
              <div className="tab-pills">
                <button
                  className={filter === 'ALL' ? 'active' : ''}
                  onClick={() => setFilter('ALL')}
                >
                  All ({items.length})
                </button>
                <button
                  className={filter === 'LOST' ? 'active' : ''}
                  onClick={() => setFilter('LOST')}
                >
                  Lost ({items.filter((i) => i.type === 'LOST' && !i.is_resolved).length})
                </button>
                <button
                  className={filter === 'FOUND' ? 'active' : ''}
                  onClick={() => setFilter('FOUND')}
                >
                  Found ({items.filter((i) => i.type === 'FOUND' && !i.is_resolved).length})
                </button>
                <button
                  className={filter === 'CLAIMED' ? 'active' : ''}
                  onClick={() => setFilter('CLAIMED')}
                >
                  Claimed ({items.filter((i) => i.is_resolved).length})
                </button>
              </div>

              <select
                className="category-dropdown"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
              >
                <option value="ALL">All Categories</option>
                <option value="Electronics">Electronics</option>
                <option value="ID/Documents">Documents</option>
                <option value="Bags/Wallets">Wallets/Bags</option>
                <option value="Keys">Keys</option>
                <option value="Bottles/Clothing">Clothing</option>
                <option value="Others">Others</option>
              </select>
            </div>
          </div>

          {/* Cards List */}
          <div className="cards-list">
            {filteredItems.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
                No active records match your search criteria.
              </div>
            ) : (
              filteredItems.map((item) => (
                <div 
                  key={item.id} 
                  className={`card-modern ${item.is_resolved ? 'card-resolved' : ''}`}
                >
                  {item.image_url ? (
                    <div
                      className="card-media"
                      onClick={() => setPreviewImage(item.image_url)}
                    >
                      <img src={item.image_url} alt={item.title} />
                      <span
                        className={`floating-badge ${
                          item.is_resolved 
                            ? 'badge-claimed-glow'
                            : item.type === 'LOST' 
                            ? 'badge-lost-glow' 
                            : 'badge-found-glow'
                        }`}
                      >
                        {item.is_resolved ? '✓ CLAIMED' : item.type}
                      </span>
                      <span className="zoom-overlay">🔍 Zoom</span>
                    </div>
                  ) : (
                    <div className="no-media-box">
                      <span>📷</span> No Photo Attached
                      {item.is_resolved && (
                        <span className="floating-badge badge-claimed-glow">✓ CLAIMED</span>
                      )}
                    </div>
                  )}

                  <div className="card-content">
                    <div className="card-meta-top">
                      <span className="category-tag-modern">{item.category}</span>
                      <button
                        className={`btn-claim-toggle ${item.is_resolved ? 'is-claimed' : ''}`}
                        onClick={() => toggleResolved(item)}
                        title="Verify PIN to update claim status"
                      >
                        {item.is_resolved ? '✓ Claimed (Locked)' : '🔒 Mark Claimed'}
                      </button>
                    </div>

                    <h3 className="card-title-modern" title={item.title}>
                      {item.title}
                    </h3>
                    <div className="card-loc">📍 {item.location}</div>
                    <p className="card-desc-modern">
                      {item.description || 'No additional details provided.'}
                    </p>

                    <div className="card-action-row">
                      <span className="contact-pill">📞 {item.contact_info}</span>
                      {!item.is_resolved ? (
                        <button
                          className="btn-whatsapp-pulse"
                          onClick={() => handleWhatsAppChat(item)}
                          type="button"
                        >
                          <span>💬</span> WhatsApp
                        </button>
                      ) : (
                        <span className="resolved-tag">Closed</span>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </main>

      {/* Image Modal */}
      {previewImage && (
        <div className="modal-backdrop" onClick={() => setPreviewImage(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <img src={previewImage} alt="Zoom Preview" className="modal-img" />
            <button
              className="modal-close-btn"
              onClick={() => setPreviewImage(null)}
            >
              ✕ Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}