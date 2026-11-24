import PropTypes from 'prop-types';
import React from 'react';
import {connect} from 'react-redux';
import {MenuItem} from '../menu/menu.jsx';
import {closeSettingsMenu} from '../../reducers/menus.js';
import {openThemeEditorModal} from '../../reducers/modals.js';
import styles from './settings-menu.css';

const PaletteIcon = () => (
    <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{marginRight: '0.5rem', flexShrink: 0}}
        aria-hidden="true"
    >
        <path d="M12 2a10 10 0 0 0 0 20 2.5 2.5 0 0 0 2.5-2.5c0-.66-.26-1.26-.68-1.7a1.5 1.5 0 0 1 1.07-2.55H17a5 5 0 0 0 5-5c0-4.42-4.48-8.25-10-8.25z" />
        <circle cx="7.5" cy="11.5" r="1.2" fill="currentColor" stroke="none" />
        <circle cx="10.5" cy="7.5" r="1.2" fill="currentColor" stroke="none" />
        <circle cx="15" cy="8" r="1.2" fill="currentColor" stroke="none" />
    </svg>
);

const UliThemeEditorMenuItem = ({onClick}) => (
    <MenuItem onClick={onClick}>
        <div className={styles.option}>
            <PaletteIcon />
            <span>Редактор тем</span>
        </div>
    </MenuItem>
);

UliThemeEditorMenuItem.propTypes = {
    onClick: PropTypes.func.isRequired
};

const mapDispatchToProps = dispatch => ({
    onClick: () => {
        dispatch(closeSettingsMenu());
        dispatch(openThemeEditorModal());
    }
});

export default connect(
    null,
    mapDispatchToProps
)(UliThemeEditorMenuItem);
