import re

with open('style.css', 'r') as f:
    css = f.read()

# Make analysis buttons look like modern tabs
css += '''
/* Analysis modern tabs */
#view-analysis .btn-primary, #view-analysis .btn-secondary {
    border-radius: 8px;
    padding: 10px 20px;
    font-weight: 600;
    font-size: 0.9rem;
    box-shadow: var(--shadow);
    transition: all 0.2s;
    border: 1px solid transparent;
}
#view-analysis .btn-secondary {
    background: white;
    color: var(--primary);
    border-color: #cbd5e1;
}
#view-analysis .btn-secondary:hover {
    background: #f8fafc;
    border-color: #94a3b8;
}

@media (max-width: 600px) {
    /* Better mobile view for the top buttons and selectors */
    #view-analysis > div:first-child {
        flex-direction: column;
        width: 100%;
    }
    #view-analysis > div:first-child button {
        width: 100%;
    }
}
'''

with open('style.css', 'w') as f:
    f.write(css)
