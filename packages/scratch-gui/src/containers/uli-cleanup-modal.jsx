import React from 'react';
import PropTypes from 'prop-types';
import {connect} from 'react-redux';
import VM from 'scratch-vm';
import {closeCleanupProjectModal} from '../reducers/modals';
import {activateTab} from '../reducers/editor-tab';
import {
    scanProjectCleanupStats,
    cleanAllProjectTargets
} from '../lib/uli-project-cleanup';
import CleanupModalComponent from '../components/uli-cleanup/cleanup-modal.jsx';

class UliCleanupModal extends React.Component {
    constructor (props) {
        super(props);
        this.state = {
            scanStats: scanProjectCleanupStats(props.vm),
            options: {
                removeHatless: true,
                removeEmptyHats: true,
                removeUnusedLocals: true,
                runCleanUpPlus: true
            },
            busy: false,
            progress: null,
            resultSummary: null,
            errorMessage: ''
        };

        this.handleToggleOption = this.handleToggleOption.bind(this);
        this.handleRunCleanup = this.handleRunCleanup.bind(this);
        this.handleClose = this.handleClose.bind(this);
    }

    handleToggleOption (key) {
        this.setState(prev => ({
            options: Object.assign({}, prev.options, {
                [key]: !prev.options[key]
            }),
            resultSummary: null,
            errorMessage: ''
        }));
    }

    async handleRunCleanup () {
        const isRu = Boolean(this.props.locale && this.props.locale.toLowerCase().startsWith('ru'));
        this.setState({
            busy: true,
            progress: null,
            resultSummary: null,
            errorMessage: ''
        });
        try {
            const summary = await cleanAllProjectTargets({
                vm: this.props.vm,
                activeTabIndex: this.props.activeTabIndex,
                onActivateTab: this.props.onActivateTab,
                options: Object.assign({}, this.state.options, {longestRight: true}),
                onProgress: progress => this.setState({progress})
            });
            this.setState({
                busy: false,
                progress: null,
                scanStats: scanProjectCleanupStats(this.props.vm),
                resultSummary: summary
            });
        } catch (err) {
            this.setState({
                busy: false,
                progress: null,
                errorMessage: err && err.message ? err.message : (isRu ? 'Ошибка очистки проекта' : 'Cleanup failed')
            });
        }
    }

    handleClose () {
        if (!this.state.busy) {
            this.props.onClose();
        }
    }

    render () {
        const isRu = Boolean(this.props.locale && this.props.locale.toLowerCase().startsWith('ru'));
        return (
            <CleanupModalComponent
                isRu={isRu}
                scanStats={this.state.scanStats}
                options={this.state.options}
                busy={this.state.busy}
                progress={this.state.progress}
                resultSummary={this.state.resultSummary}
                errorMessage={this.state.errorMessage}
                onToggleOption={this.handleToggleOption}
                onRunCleanup={this.handleRunCleanup}
                onClose={this.handleClose}
            />
        );
    }
}

UliCleanupModal.propTypes = {
    vm: PropTypes.instanceOf(VM).isRequired,
    locale: PropTypes.string,
    activeTabIndex: PropTypes.number,
    onActivateTab: PropTypes.func.isRequired,
    onClose: PropTypes.func.isRequired
};

const mapStateToProps = state => ({
    vm: state.scratchGui.vm,
    locale: state.locales.locale,
    activeTabIndex: state.scratchGui.editorTab.activeTabIndex
});

const mapDispatchToProps = dispatch => ({
    onActivateTab: tabIndex => dispatch(activateTab(tabIndex)),
    onClose: () => dispatch(closeCleanupProjectModal())
});

export default connect(
    mapStateToProps,
    mapDispatchToProps
)(UliCleanupModal);
