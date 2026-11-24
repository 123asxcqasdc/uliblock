import PropTypes from 'prop-types';
import React from 'react';
import {connect} from 'react-redux';
import {closeThemeEditorModal} from '../reducers/modals';
import {
    createEmptyTheme,
    sanitizeTheme,
    loadCustomThemeStore,
    saveCustomThemeStore,
    applyCustomTheme,
    applyActiveCustomTheme
} from '../lib/themes/uli-custom-themes';
import {applyGuiColors} from '../lib/themes/guiHelpers';
import ThemeEditorModalComponent from '../components/uli-theme-editor/theme-editor-modal.jsx';

class UliThemeEditorModal extends React.Component {
    constructor (props) {
        super(props);
        const store = loadCustomThemeStore();
        const initialSelected = store.activeThemeId || (store.themes[0] ? store.themes[0].id : null);
        const initialDraft = initialSelected ?
            Object.assign({}, store.themes.find(t => t.id === initialSelected)) :
            null;
        this.state = {
            themes: store.themes,
            activeThemeId: store.activeThemeId,
            selectedThemeId: initialSelected,
            draft: initialDraft,
            statusMessage: '',
            errorMessage: ''
        };
    }

    componentWillUnmount () {
        // Restore persisted active theme if user closed without saving preview changes
        applyGuiColors(this.props.theme);
        applyActiveCustomTheme();
    }

    persistStore (themes, activeThemeId, extraState = {}) {
        try {
            const saved = saveCustomThemeStore({themes, activeThemeId});
            this.setState(Object.assign({
                themes: saved.themes,
                activeThemeId: saved.activeThemeId,
                errorMessage: ''
            }, extraState));
            return saved;
        } catch (err) {
            this.setState({
                errorMessage: `Не удалось сохранить тему (возможно, картинка слишком большая для хранилища): ${err.message}`
            });
            return null;
        }
    }

    handleSelectTheme = id => {
        const found = this.state.themes.find(t => t.id === id);
        if (!found) return;
        const draft = sanitizeTheme(found);
        this.setState({
            selectedThemeId: id,
            draft,
            statusMessage: '',
            errorMessage: ''
        });
        // Live preview!
        applyGuiColors(this.props.theme);
        applyCustomTheme(draft);
    };

    handleCreateTheme = () => {
        const nextNum = this.state.themes.length + 1;
        const fresh = createEmptyTheme(`Моя тема ${nextNum}`);
        const nextThemes = [...this.state.themes, fresh];
        if (this.persistStore(nextThemes, fresh.id, {
            selectedThemeId: fresh.id,
            draft: fresh,
            statusMessage: `Создана и активирована «${fresh.name}»`
        })) {
            applyGuiColors(this.props.theme);
            applyCustomTheme(fresh);
        }
    };

    handleDuplicateTheme = () => {
        if (!this.state.draft) return;
        const copy = sanitizeTheme(Object.assign({}, this.state.draft, {
            id: createEmptyTheme().id,
            name: `${this.state.draft.name} (копия)`
        }));
        const nextThemes = [...this.state.themes, copy];
        if (this.persistStore(nextThemes, copy.id, {
            selectedThemeId: copy.id,
            draft: copy,
            statusMessage: `Создана копия «${copy.name}»`
        })) {
            applyGuiColors(this.props.theme);
            applyCustomTheme(copy);
        }
    };

    handleDeleteTheme = () => {
        const {selectedThemeId, themes, activeThemeId} = this.state;
        if (!selectedThemeId) return;
        const nextThemes = themes.filter(t => t.id !== selectedThemeId);
        const nextActive = activeThemeId === selectedThemeId ? null : activeThemeId;
        const nextSelected = nextThemes[0] ? nextThemes[0].id : null;
        const nextDraft = nextSelected ? sanitizeTheme(nextThemes[0]) : null;
        if (this.persistStore(nextThemes, nextActive, {
            selectedThemeId: nextSelected,
            draft: nextDraft,
            statusMessage: 'Тема удалена'
        })) {
            applyGuiColors(this.props.theme);
            applyActiveCustomTheme();
        }
    };

    handleUpdateDraft = patch => {
        if (!this.state.draft) return;
        const nextDraft = sanitizeTheme(Object.assign({}, this.state.draft, patch));
        this.setState({
            draft: nextDraft,
            statusMessage: '',
            errorMessage: ''
        });
        // Live preview as the user tweaks colors/wallpapers/icons/CSS!
        applyGuiColors(this.props.theme);
        applyCustomTheme(nextDraft);
    };

    handleApplyTheme = () => {
        const {draft, themes} = this.state;
        if (!draft) return;
        const clean = sanitizeTheme(draft);
        const exists = themes.some(t => t.id === clean.id);
        const nextThemes = exists ?
            themes.map(t => (t.id === clean.id ? clean : t)) :
            [...themes, clean];
        if (this.persistStore(nextThemes, clean.id, {
            selectedThemeId: clean.id,
            draft: clean,
            statusMessage: `Тема «${clean.name}» сохранена и применена!`
        })) {
            applyGuiColors(this.props.theme);
            applyCustomTheme(clean);
        }
    };

    handleResetDefaultTheme = () => {
        if (this.persistStore(this.state.themes, null, {
            selectedThemeId: null,
            draft: null,
            statusMessage: 'Включена стандартная тема UliBlock'
        })) {
            applyCustomTheme(null);
            applyGuiColors(this.props.theme);
        }
    };

    handleExportTheme = () => {
        if (!this.state.draft) return;
        const clean = sanitizeTheme(this.state.draft);
        const blob = new Blob([JSON.stringify(clean, null, 2)], {type: 'application/json'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const safeName = clean.name.replace(/[^a-zA-Z0-9а-яА-ЯёЁ_-]+/g, '_') || 'uliblock-theme';
        a.href = url;
        a.download = `${safeName}.ulitheme.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        this.setState({statusMessage: `Экспортировано: ${safeName}.ulitheme.json`});
    };

    handleImportThemeJson = jsonText => {
        try {
            const parsed = JSON.parse(jsonText);
            const imported = sanitizeTheme(Object.assign({}, parsed, {
                id: createEmptyTheme().id
            }));
            const nextThemes = [...this.state.themes, imported];
            if (this.persistStore(nextThemes, imported.id, {
                selectedThemeId: imported.id,
                draft: imported,
                statusMessage: `Импортирована тема «${imported.name}»`
            })) {
                applyGuiColors(this.props.theme);
                applyCustomTheme(imported);
            }
        } catch (err) {
            this.setState({
                errorMessage: `Некорректный JSON-файл темы: ${err.message}`
            });
        }
    };

    render () {
        return (
            <ThemeEditorModalComponent
                themes={this.state.themes}
                activeThemeId={this.state.activeThemeId}
                selectedThemeId={this.state.selectedThemeId}
                draft={this.state.draft}
                statusMessage={this.state.statusMessage}
                errorMessage={this.state.errorMessage}
                onClose={this.props.onClose}
                onSelectTheme={this.handleSelectTheme}
                onCreateTheme={this.handleCreateTheme}
                onDuplicateTheme={this.handleDuplicateTheme}
                onDeleteTheme={this.handleDeleteTheme}
                onUpdateDraft={this.handleUpdateDraft}
                onApplyTheme={this.handleApplyTheme}
                onResetDefaultTheme={this.handleResetDefaultTheme}
                onExportTheme={this.handleExportTheme}
                onImportThemeJson={this.handleImportThemeJson}
            />
        );
    }
}

UliThemeEditorModal.propTypes = {
    onClose: PropTypes.func.isRequired,
    theme: PropTypes.object.isRequired
};

const mapStateToProps = state => ({
    theme: state.scratchGui.theme.theme
});

const mapDispatchToProps = dispatch => ({
    onClose: () => dispatch(closeThemeEditorModal())
});

export default connect(
    mapStateToProps,
    mapDispatchToProps
)(UliThemeEditorModal);
