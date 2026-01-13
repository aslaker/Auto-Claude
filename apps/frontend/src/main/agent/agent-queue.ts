import { spawn } from 'child_process';
import path from 'path';
import { existsSync, promises as fsPromises } from 'fs';
import { EventEmitter } from 'events';
import { AgentState } from './agent-state';
import { AgentEvents } from './agent-events';
import { AgentProcessManager } from './agent-process';
import { RoadmapConfig, PersonaConfig } from './types';
import type { IdeationConfig, Idea, PersonasConfig, PersonaEnrichmentInput, Persona } from '../../shared/types';
import { detectRateLimit, createSDKRateLimitInfo, getProfileEnv } from '../rate-limit-detector';
import { getAPIProfileEnv } from '../services/profile';
import { getOAuthModeClearVars } from './env-utils';
import { debugLog, debugError } from '../../shared/utils/debug-logger';
import { parsePythonCommand } from '../python-detector';
import { pythonEnvManager } from '../python-env-manager';
import { transformIdeaFromSnakeCase, transformSessionFromSnakeCase } from '../ipc-handlers/ideation/transformers';
import { transformRoadmapFromSnakeCase } from '../ipc-handlers/roadmap/transformers';
import type { RawIdea } from '../ipc-handlers/ideation/types';

/**
 * Queue management for ideation and roadmap generation
 */
export class AgentQueueManager {
  private state: AgentState;
  private events: AgentEvents;
  private processManager: AgentProcessManager;
  private emitter: EventEmitter;

  constructor(
    state: AgentState,
    events: AgentEvents,
    processManager: AgentProcessManager,
    emitter: EventEmitter
  ) {
    this.state = state;
    this.events = events;
    this.processManager = processManager;
    this.emitter = emitter;
  }

  /**
   * Ensure Python environment is ready before spawning processes.
   * Prevents the race condition where generation starts before dependencies are installed,
   * which would cause it to fall back to system Python and fail with ModuleNotFoundError.
   *
   * @param projectId - The project ID for error event emission
   * @param eventType - The error event type to emit on failure
   * @returns true if environment is ready, false if initialization failed (error already emitted)
   */
  private async ensurePythonEnvReady(
    projectId: string,
    eventType: 'ideation-error' | 'roadmap-error' | 'persona-error'
  ): Promise<boolean> {
    const autoBuildSource = this.processManager.getAutoBuildSourcePath();

    if (!pythonEnvManager.isEnvReady()) {
      debugLog('[Agent Queue] Python environment not ready, waiting for initialization...');
      if (autoBuildSource) {
        const status = await pythonEnvManager.initialize(autoBuildSource);
        if (!status.ready) {
          debugError('[Agent Queue] Python environment initialization failed:', status.error);
          this.emitter.emit(eventType, projectId, `Python environment not ready: ${status.error || 'initialization failed'}`);
          return false;
        }
        debugLog('[Agent Queue] Python environment now ready');
      } else {
        debugError('[Agent Queue] Cannot initialize Python - auto-build source not found');
        this.emitter.emit(eventType, projectId, 'Python environment not ready: auto-build source not found');
        return false;
      }
    }
    return true;
  }

  /**
   * Start roadmap generation process
   *
   * @param refreshCompetitorAnalysis - Force refresh competitor analysis even if it exists.
   *   This allows refreshing competitor data independently of the general roadmap refresh.
   *   Use when user explicitly wants new competitor research.
   * @param enablePersonaGeneration - Generate user personas as part of roadmap generation
   * @param refreshPersonas - Force regenerate personas even if they exist
   */
  async startRoadmapGeneration(
    projectId: string,
    projectPath: string,
    refresh: boolean = false,
    enableCompetitorAnalysis: boolean = false,
    refreshCompetitorAnalysis: boolean = false,
    config?: RoadmapConfig,
    enablePersonaGeneration: boolean = false,
    refreshPersonas: boolean = false
  ): Promise<void> {
    debugLog('[Agent Queue] Starting roadmap generation:', {
      projectId,
      projectPath,
      refresh,
      enableCompetitorAnalysis,
      refreshCompetitorAnalysis,
      enablePersonaGeneration,
      refreshPersonas,
      config
    });

    const autoBuildSource = this.processManager.getAutoBuildSourcePath();

    if (!autoBuildSource) {
      debugError('[Agent Queue] Auto-build source path not found');
      this.emitter.emit('roadmap-error', projectId, 'Auto-build source path not found. Please configure it in App Settings.');
      return;
    }

    const roadmapRunnerPath = path.join(autoBuildSource, 'runners', 'roadmap_runner.py');

    if (!existsSync(roadmapRunnerPath)) {
      debugError('[Agent Queue] Roadmap runner not found at:', roadmapRunnerPath);
      this.emitter.emit('roadmap-error', projectId, `Roadmap runner not found at: ${roadmapRunnerPath}`);
      return;
    }

    const args = [roadmapRunnerPath, '--project', projectPath];

    if (refresh) {
      args.push('--refresh');
    }

    // Add competitor analysis flag if enabled
    if (enableCompetitorAnalysis) {
      args.push('--competitor-analysis');
    }

    // Add refresh competitor analysis flag if user wants fresh competitor data
    if (refreshCompetitorAnalysis) {
      args.push('--refresh-competitor-analysis');
    }

    // Add persona generation flags
    if (enablePersonaGeneration) {
      args.push('--persona-generation');
    }

    if (refreshPersonas) {
      args.push('--refresh-personas');
    }

    // Add model and thinking level from config
    // Pass shorthand (opus/sonnet/haiku) - backend resolves using API profile env vars
    if (config?.model) {
      args.push('--model', config.model);
    }
    if (config?.thinkingLevel) {
      args.push('--thinking-level', config.thinkingLevel);
    }

    debugLog('[Agent Queue] Spawning roadmap process with args:', args);

    // Use projectId as taskId for roadmap operations
    await this.spawnRoadmapProcess(projectId, projectPath, args);
  }

  /**
   * Start ideation generation process
   */
  async startIdeationGeneration(
    projectId: string,
    projectPath: string,
    config: IdeationConfig,
    refresh: boolean = false
  ): Promise<void> {
    debugLog('[Agent Queue] Starting ideation generation:', {
      projectId,
      projectPath,
      config,
      refresh
    });

    const autoBuildSource = this.processManager.getAutoBuildSourcePath();

    if (!autoBuildSource) {
      debugError('[Agent Queue] Auto-build source path not found');
      this.emitter.emit('ideation-error', projectId, 'Auto-build source path not found. Please configure it in App Settings.');
      return;
    }

    const ideationRunnerPath = path.join(autoBuildSource, 'runners', 'ideation_runner.py');

    if (!existsSync(ideationRunnerPath)) {
      debugError('[Agent Queue] Ideation runner not found at:', ideationRunnerPath);
      this.emitter.emit('ideation-error', projectId, `Ideation runner not found at: ${ideationRunnerPath}`);
      return;
    }

    const args = [ideationRunnerPath, '--project', projectPath];

    // Add enabled types as comma-separated list
    if (config.enabledTypes.length > 0) {
      args.push('--types', config.enabledTypes.join(','));
    }

    // Add context flags (script uses --no-roadmap/--no-kanban negative flags)
    if (!config.includeRoadmapContext) {
      args.push('--no-roadmap');
    }
    if (!config.includeKanbanContext) {
      args.push('--no-kanban');
    }

    // Add max ideas per type
    if (config.maxIdeasPerType) {
      args.push('--max-ideas', config.maxIdeasPerType.toString());
    }

    if (refresh) {
      args.push('--refresh');
    }

    // Add append flag to preserve existing ideas
    if (config.append) {
      args.push('--append');
    }

    // Add model and thinking level from config
    // Pass shorthand (opus/sonnet/haiku) - backend resolves using API profile env vars
    if (config.model) {
      args.push('--model', config.model);
    }
    if (config.thinkingLevel) {
      args.push('--thinking-level', config.thinkingLevel);
    }

    debugLog('[Agent Queue] Spawning ideation process with args:', args);

    // Use projectId as taskId for ideation operations
    await this.spawnIdeationProcess(projectId, projectPath, args);
  }

  /**
   * Spawn a Python process for ideation generation
   */
  private async spawnIdeationProcess(
    projectId: string,
    projectPath: string,
    args: string[]
  ): Promise<void> {
    debugLog('[Agent Queue] Spawning ideation process:', { projectId, projectPath });

    // Run from auto-claude source directory so imports work correctly
    const autoBuildSource = this.processManager.getAutoBuildSourcePath();
    const cwd = autoBuildSource || process.cwd();

    // Ensure Python environment is ready before spawning
    if (!await this.ensurePythonEnvReady(projectId, 'ideation-error')) {
      return;
    }

    // Kill existing process for this project if any
    const wasKilled = this.processManager.killProcess(projectId);
    if (wasKilled) {
      debugLog('[Agent Queue] Killed existing process for project:', projectId);
    }

    // Generate unique spawn ID for this process instance
    const spawnId = this.state.generateSpawnId();
    debugLog('[Agent Queue] Generated spawn ID:', spawnId);


    // Get combined environment variables
    const combinedEnv = this.processManager.getCombinedEnv(projectPath);

    // Get active Claude profile environment (CLAUDE_CODE_OAUTH_TOKEN if not default)
    const profileEnv = getProfileEnv();

    // Get active API profile environment variables
    const apiProfileEnv = await getAPIProfileEnv();

    // Get OAuth mode clearing vars (clears stale ANTHROPIC_* vars when in OAuth mode)
    const oauthModeClearVars = getOAuthModeClearVars(apiProfileEnv);

    // Get Python path from process manager (uses venv if configured)
    const pythonPath = this.processManager.getPythonPath();

    // Get Python environment from pythonEnvManager (includes bundled site-packages)
    const pythonEnv = pythonEnvManager.getPythonEnv();

    // Build PYTHONPATH: bundled site-packages (if any) + autoBuildSource for local imports
    const pythonPathParts: string[] = [];
    if (pythonEnv.PYTHONPATH) {
      pythonPathParts.push(pythonEnv.PYTHONPATH);
    }
    if (autoBuildSource) {
      pythonPathParts.push(autoBuildSource);
    }
    const combinedPythonPath = pythonPathParts.join(process.platform === 'win32' ? ';' : ':');

    // Build final environment with proper precedence:
    // 1. process.env (system)
    // 2. pythonEnv (bundled packages environment)
    // 3. combinedEnv (auto-claude/.env for CLI usage)
    // 4. oauthModeClearVars (clear stale ANTHROPIC_* vars when in OAuth mode)
    // 5. profileEnv (Electron app OAuth token)
    // 6. apiProfileEnv (Active API profile config - highest priority for ANTHROPIC_* vars)
    // 7. Our specific overrides
    const finalEnv = {
      ...process.env,
      ...pythonEnv,
      ...combinedEnv,
      ...oauthModeClearVars,
      ...profileEnv,
      ...apiProfileEnv,
      PYTHONPATH: combinedPythonPath,
      PYTHONUNBUFFERED: '1',
      PYTHONUTF8: '1'
    };

    // Debug: Show OAuth token source (token values intentionally omitted for security - AC4)
    const tokenSource = profileEnv['CLAUDE_CODE_OAUTH_TOKEN']
      ? 'Electron app profile'
      : (combinedEnv['CLAUDE_CODE_OAUTH_TOKEN'] ? 'auto-claude/.env' : 'not found');
    const hasToken = !!(finalEnv as Record<string, string | undefined>)['CLAUDE_CODE_OAUTH_TOKEN'];
    debugLog('[Agent Queue] OAuth token status:', {
      source: tokenSource,
      hasToken
    });

    // Parse Python command to handle space-separated commands like "py -3"
    const [pythonCommand, pythonBaseArgs] = parsePythonCommand(pythonPath);
    const childProcess = spawn(pythonCommand, [...pythonBaseArgs, ...args], {
      cwd,
      env: finalEnv
    });

    this.state.addProcess(projectId, {
      taskId: projectId,
      process: childProcess,
      startedAt: new Date(),
      projectPath, // Store project path for loading session on completion
      spawnId,
      queueProcessType: 'ideation'
    });

    // Track progress through output
    let progressPhase = 'analyzing';
    let progressPercent = 10;
    // Collect output for rate limit detection
    let allOutput = '';

    // Helper to emit logs - split multi-line output into individual log lines
    const emitLogs = (log: string) => {
      const lines = log.split('\n').filter(line => line.trim().length > 0);
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.length > 0) {
          this.emitter.emit('ideation-log', projectId, trimmed);
        }
      }
    };

    // Track completed types for progress calculation
    const completedTypes = new Set<string>();
    const totalTypes = 7; // Default all types

    // Handle stdout - explicitly decode as UTF-8 for cross-platform Unicode support
    childProcess.stdout?.on('data', (data: Buffer) => {
      const log = data.toString('utf8');
      // Collect output for rate limit detection (keep last 10KB)
      allOutput = (allOutput + log).slice(-10000);

      // Emit all log lines for the activity log
      emitLogs(log);

      const typeCompleteMatch = log.match(/IDEATION_TYPE_COMPLETE:(\w+):(\d+)/);
      if (typeCompleteMatch) {
        const [, ideationType, ideasCount] = typeCompleteMatch;
        completedTypes.add(ideationType);

        debugLog('[Agent Queue] Ideation type completed:', {
          projectId,
          ideationType,
          ideasCount: parseInt(ideasCount, 10),
          totalCompleted: completedTypes.size
        });

        const typeFilePath = path.join(
          projectPath,
          '.auto-claude',
          'ideation',
          `${ideationType}_ideas.json`
        );

        const loadIdeationType = async (): Promise<void> => {
          try {
            const content = await fsPromises.readFile(typeFilePath, 'utf-8');
            const data: Record<string, RawIdea[]> = JSON.parse(content);
            const rawIdeas: RawIdea[] = data[ideationType] || [];
            const ideas: Idea[] = rawIdeas.map(transformIdeaFromSnakeCase);
            debugLog('[Agent Queue] Loaded ideas for type:', {
              ideationType,
              loadedCount: ideas.length,
              filePath: typeFilePath
            });
            this.emitter.emit('ideation-type-complete', projectId, ideationType, ideas);
          } catch (err) {
            if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
              debugError('[Agent Queue] Ideas file not found:', typeFilePath);
            } else {
              debugError('[Agent Queue] Failed to load ideas for type:', ideationType, err);
            }
            this.emitter.emit('ideation-type-complete', projectId, ideationType, []);
          }
        };
        loadIdeationType().catch((err: unknown) => {
          debugError('[Agent Queue] Unhandled error in ideation type handler (event already emitted):', {
            ideationType,
            projectId,
            typeFilePath
          }, err);
        });
      }

      const typeFailedMatch = log.match(/IDEATION_TYPE_FAILED:(\w+)/);
      if (typeFailedMatch) {
        const [, ideationType] = typeFailedMatch;
        completedTypes.add(ideationType);

        debugError('[Agent Queue] Ideation type failed:', { projectId, ideationType });
        this.emitter.emit('ideation-type-failed', projectId, ideationType);
      }

      // Parse progress using AgentEvents
      const progressUpdate = this.events.parseIdeationProgress(
        log,
        progressPhase,
        progressPercent,
        completedTypes,
        totalTypes
      );
      progressPhase = progressUpdate.phase;
      progressPercent = progressUpdate.progress;

      // Emit progress update with a clean message for the status bar
      const statusMessage = log.trim().split('\n')[0].substring(0, 200);
      this.emitter.emit('ideation-progress', projectId, {
        phase: progressPhase,
        progress: progressPercent,
        message: statusMessage,
        completedTypes: Array.from(completedTypes)
      });
    });

    // Handle stderr - also emit as logs, explicitly decode as UTF-8
    childProcess.stderr?.on('data', (data: Buffer) => {
      const log = data.toString('utf8');
      // Collect stderr for rate limit detection too
      allOutput = (allOutput + log).slice(-10000);
      console.error('[Ideation STDERR]', log);
      emitLogs(log);
      this.emitter.emit('ideation-progress', projectId, {
        phase: progressPhase,
        progress: progressPercent,
        message: log.trim().split('\n')[0].substring(0, 200)
      });
    });

    // Handle process exit
    childProcess.on('exit', (code: number | null) => {
      debugLog('[Agent Queue] Ideation process exited:', { projectId, code, spawnId });

      // Check if this process was intentionally stopped by the user
      const wasIntentionallyStopped = this.state.wasSpawnKilled(spawnId);
      if (wasIntentionallyStopped) {
        debugLog('[Agent Queue] Ideation process was intentionally stopped, ignoring exit');
        this.state.clearKilledSpawn(spawnId);
        // Note: Don't call deleteProcess here - killProcess() already deleted it.
        // A new process with the same projectId may have been started.
        // Emit stopped event to ensure UI updates
        this.emitter.emit('ideation-stopped', projectId);
        return;
      }

      // Get the stored project path before deleting from map
      const processInfo = this.state.getProcess(projectId);
      const storedProjectPath = processInfo?.projectPath;
      this.state.deleteProcess(projectId);

      // Check for rate limit if process failed
      if (code !== 0) {
        debugLog('[Agent Queue] Checking for rate limit (non-zero exit)');
        const rateLimitDetection = detectRateLimit(allOutput);
        if (rateLimitDetection.isRateLimited) {
          debugLog('[Agent Queue] Rate limit detected for ideation');
          const rateLimitInfo = createSDKRateLimitInfo('ideation', rateLimitDetection, {
            projectId
          });
          this.emitter.emit('sdk-rate-limit', rateLimitInfo);
        }
      }

      if (code === 0) {
        debugLog('[Agent Queue] Ideation generation completed successfully');
        this.emitter.emit('ideation-progress', projectId, {
          phase: 'complete',
          progress: 100,
          message: 'Ideation generation complete'
        });

        // Load and emit the complete ideation session
        if (storedProjectPath) {
          try {
            const ideationFilePath = path.join(
              storedProjectPath,
              '.auto-claude',
              'ideation',
              'ideation.json'
            );
            debugLog('[Agent Queue] Loading ideation session from:', ideationFilePath);
            if (existsSync(ideationFilePath)) {
              const loadSession = async (): Promise<void> => {
                try {
                  const content = await fsPromises.readFile(ideationFilePath, 'utf-8');
                  const rawSession = JSON.parse(content);
                  const session = transformSessionFromSnakeCase(rawSession, projectId);
                  debugLog('[Agent Queue] Loaded ideation session:', {
                    totalIdeas: session.ideas?.length || 0
                  });
                  this.emitter.emit('ideation-complete', projectId, session);
                } catch (err) {
                  debugError('[Ideation] Failed to load ideation session:', err);
                  this.emitter.emit('ideation-error', projectId,
                    `Failed to load ideation session: ${err instanceof Error ? err.message : 'Unknown error'}`);
                }
              };
              loadSession().catch((err: unknown) => {
                debugError('[Agent Queue] Unhandled error loading ideation session:', err);
              });
            } else {
              debugError('[Ideation] ideation.json not found at:', ideationFilePath);
              this.emitter.emit('ideation-error', projectId,
                'Ideation completed but session file not found. Ideas may have been saved to individual type files.');
            }
          } catch (err) {
            debugError('[Ideation] Unexpected error in ideation completion:', err);
            this.emitter.emit('ideation-error', projectId,
              `Failed to load ideation session: ${err instanceof Error ? err.message : 'Unknown error'}`);
          }
        } else {
          debugError('[Ideation] No project path available to load session');
          this.emitter.emit('ideation-error', projectId,
            'Ideation completed but project path unavailable');
        }
      } else {
        debugError('[Agent Queue] Ideation generation failed:', { projectId, code });
        this.emitter.emit('ideation-error', projectId, `Ideation generation failed with exit code ${code}`);
      }
    });

    // Handle process error
    childProcess.on('error', (err: Error) => {
      console.error('[Ideation] Process error:', err.message);
      this.state.deleteProcess(projectId);
      this.emitter.emit('ideation-error', projectId, err.message);
    });
  }

  /**
   * Spawn a Python process for roadmap generation
   */
  private async spawnRoadmapProcess(
    projectId: string,
    projectPath: string,
    args: string[]
  ): Promise<void> {
    debugLog('[Agent Queue] Spawning roadmap process:', { projectId, projectPath });

    // Run from auto-claude source directory so imports work correctly
    const autoBuildSource = this.processManager.getAutoBuildSourcePath();
    const cwd = autoBuildSource || process.cwd();

    // Ensure Python environment is ready before spawning
    if (!await this.ensurePythonEnvReady(projectId, 'roadmap-error')) {
      return;
    }

    // Kill existing process for this project if any
    const wasKilled = this.processManager.killProcess(projectId);
    if (wasKilled) {
      debugLog('[Agent Queue] Killed existing roadmap process for project:', projectId);
    }

    // Generate unique spawn ID for this process instance
    const spawnId = this.state.generateSpawnId();
    debugLog('[Agent Queue] Generated roadmap spawn ID:', spawnId);


    // Get combined environment variables
    const combinedEnv = this.processManager.getCombinedEnv(projectPath);

    // Get active Claude profile environment (CLAUDE_CODE_OAUTH_TOKEN if not default)
    const profileEnv = getProfileEnv();

    // Get active API profile environment variables
    const apiProfileEnv = await getAPIProfileEnv();

    // Get OAuth mode clearing vars (clears stale ANTHROPIC_* vars when in OAuth mode)
    const oauthModeClearVars = getOAuthModeClearVars(apiProfileEnv);

    // Get Python path from process manager (uses venv if configured)
    const pythonPath = this.processManager.getPythonPath();

    // Get Python environment from pythonEnvManager (includes bundled site-packages)
    const pythonEnv = pythonEnvManager.getPythonEnv();

    // Build PYTHONPATH: bundled site-packages (if any) + autoBuildSource for local imports
    const pythonPathParts: string[] = [];
    if (pythonEnv.PYTHONPATH) {
      pythonPathParts.push(pythonEnv.PYTHONPATH);
    }
    if (autoBuildSource) {
      pythonPathParts.push(autoBuildSource);
    }
    const combinedPythonPath = pythonPathParts.join(process.platform === 'win32' ? ';' : ':');

    // Build final environment with proper precedence:
    // 1. process.env (system)
    // 2. pythonEnv (bundled packages environment)
    // 3. combinedEnv (auto-claude/.env for CLI usage)
    // 4. oauthModeClearVars (clear stale ANTHROPIC_* vars when in OAuth mode)
    // 5. profileEnv (Electron app OAuth token)
    // 6. apiProfileEnv (Active API profile config - highest priority for ANTHROPIC_* vars)
    // 7. Our specific overrides
    const finalEnv = {
      ...process.env,
      ...pythonEnv,
      ...combinedEnv,
      ...oauthModeClearVars,
      ...profileEnv,
      ...apiProfileEnv,
      PYTHONPATH: combinedPythonPath,
      PYTHONUNBUFFERED: '1',
      PYTHONUTF8: '1'
    };

    // Debug: Show OAuth token source (token values intentionally omitted for security - AC4)
    const tokenSource = profileEnv['CLAUDE_CODE_OAUTH_TOKEN']
      ? 'Electron app profile'
      : (combinedEnv['CLAUDE_CODE_OAUTH_TOKEN'] ? 'auto-claude/.env' : 'not found');
    const hasToken = !!(finalEnv as Record<string, string | undefined>)['CLAUDE_CODE_OAUTH_TOKEN'];
    debugLog('[Agent Queue] OAuth token status:', {
      source: tokenSource,
      hasToken
    });

    // Parse Python command to handle space-separated commands like "py -3"
    const [pythonCommand, pythonBaseArgs] = parsePythonCommand(pythonPath);
    const childProcess = spawn(pythonCommand, [...pythonBaseArgs, ...args], {
      cwd,
      env: finalEnv
    });

    this.state.addProcess(projectId, {
      taskId: projectId,
      process: childProcess,
      startedAt: new Date(),
      projectPath, // Store project path for loading roadmap on completion
      spawnId,
      queueProcessType: 'roadmap'
    });

    // Track progress through output
    let progressPhase = 'analyzing';
    let progressPercent = 10;
    // Collect output for rate limit detection
    let allRoadmapOutput = '';

    // Helper to emit logs - split multi-line output into individual log lines
    const emitLogs = (log: string) => {
      const lines = log.split('\n').filter(line => line.trim().length > 0);
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.length > 0) {
          this.emitter.emit('roadmap-log', projectId, trimmed);
        }
      }
    };

    // Handle stdout - explicitly decode as UTF-8 for cross-platform Unicode support
    childProcess.stdout?.on('data', (data: Buffer) => {
      const log = data.toString('utf8');
      // Collect output for rate limit detection (keep last 10KB)
      allRoadmapOutput = (allRoadmapOutput + log).slice(-10000);

      // Emit all log lines for debugging
      emitLogs(log);

      // Parse progress using AgentEvents
      const progressUpdate = this.events.parseRoadmapProgress(log, progressPhase, progressPercent);
      progressPhase = progressUpdate.phase;
      progressPercent = progressUpdate.progress;

      // Emit progress update
      this.emitter.emit('roadmap-progress', projectId, {
        phase: progressPhase,
        progress: progressPercent,
        message: log.trim().substring(0, 200) // Truncate long messages
      });
    });

    // Handle stderr - explicitly decode as UTF-8
    childProcess.stderr?.on('data', (data: Buffer) => {
      const log = data.toString('utf8');
      // Collect stderr for rate limit detection too
      allRoadmapOutput = (allRoadmapOutput + log).slice(-10000);
      console.error('[Roadmap STDERR]', log);
      emitLogs(log);
      this.emitter.emit('roadmap-progress', projectId, {
        phase: progressPhase,
        progress: progressPercent,
        message: log.trim().substring(0, 200)
      });
    });

    // Handle process exit
    childProcess.on('exit', (code: number | null) => {
      debugLog('[Agent Queue] Roadmap process exited:', { projectId, code, spawnId });

      // Check if this process was intentionally stopped by the user
      const wasIntentionallyStopped = this.state.wasSpawnKilled(spawnId);
      if (wasIntentionallyStopped) {
        debugLog('[Agent Queue] Roadmap process was intentionally stopped, ignoring exit');
        this.state.clearKilledSpawn(spawnId);
        // Note: Don't call deleteProcess here - killProcess() already deleted it.
        // A new process with the same projectId may have been started.
        return;
      }

      // Get the stored project path before deleting from map
      const processInfo = this.state.getProcess(projectId);
      const storedProjectPath = processInfo?.projectPath;
      this.state.deleteProcess(projectId);

      // Check for rate limit if process failed
      if (code !== 0) {
        debugLog('[Agent Queue] Checking for rate limit (non-zero exit)');
        const rateLimitDetection = detectRateLimit(allRoadmapOutput);
        if (rateLimitDetection.isRateLimited) {
          debugLog('[Agent Queue] Rate limit detected for roadmap');
          const rateLimitInfo = createSDKRateLimitInfo('roadmap', rateLimitDetection, {
            projectId
          });
          this.emitter.emit('sdk-rate-limit', rateLimitInfo);
        }
      }

      if (code === 0) {
        debugLog('[Agent Queue] Roadmap generation completed successfully');
        this.emitter.emit('roadmap-progress', projectId, {
          phase: 'complete',
          progress: 100,
          message: 'Roadmap generation complete'
        });

        // Load and emit the complete roadmap
        if (storedProjectPath) {
          try {
            const roadmapFilePath = path.join(
              storedProjectPath,
              '.auto-claude',
              'roadmap',
              'roadmap.json'
            );
            debugLog('[Agent Queue] Loading roadmap from:', roadmapFilePath);
            if (existsSync(roadmapFilePath)) {
              const loadRoadmap = async (): Promise<void> => {
                try {
                  const content = await fsPromises.readFile(roadmapFilePath, 'utf-8');
                  const rawRoadmap = JSON.parse(content);
                  const transformedRoadmap = transformRoadmapFromSnakeCase(rawRoadmap, projectId);
                  debugLog('[Agent Queue] Loaded roadmap:', {
                    featuresCount: transformedRoadmap.features?.length || 0,
                    phasesCount: transformedRoadmap.phases?.length || 0
                  });
                  this.emitter.emit('roadmap-complete', projectId, transformedRoadmap);
                } catch (err) {
                  debugError('[Roadmap] Failed to load roadmap:', err);
                  this.emitter.emit('roadmap-error', projectId,
                    `Failed to load roadmap: ${err instanceof Error ? err.message : 'Unknown error'}`);
                }
              };
              loadRoadmap().catch((err: unknown) => {
                debugError('[Agent Queue] Unhandled error loading roadmap:', err);
              });
            } else {
              debugError('[Roadmap] roadmap.json not found at:', roadmapFilePath);
              this.emitter.emit('roadmap-error', projectId,
                'Roadmap completed but file not found.');
            }
          } catch (err) {
            debugError('[Roadmap] Unexpected error in roadmap completion:', err);
            this.emitter.emit('roadmap-error', projectId,
              `Unexpected error: ${err instanceof Error ? err.message : 'Unknown error'}`);
          }
        } else {
          debugError('[Roadmap] No project path available for roadmap completion');
          this.emitter.emit('roadmap-error', projectId, 'Roadmap completed but project path not found.');
        }
      } else {
        debugError('[Agent Queue] Roadmap generation failed:', { projectId, code });
        this.emitter.emit('roadmap-error', projectId, `Roadmap generation failed with exit code ${code}`);
      }
    });

    // Handle process error
    childProcess.on('error', (err: Error) => {
      console.error('[Roadmap] Process error:', err.message);
      this.state.deleteProcess(projectId);
      this.emitter.emit('roadmap-error', projectId, err.message);
    });
  }

  /**
   * Stop ideation generation for a project
   */
  stopIdeation(projectId: string): boolean {
    debugLog('[Agent Queue] Stop ideation requested:', { projectId });

    const processInfo = this.state.getProcess(projectId);
    const isIdeation = processInfo?.queueProcessType === 'ideation';
    debugLog('[Agent Queue] Process running?', { projectId, isIdeation, processType: processInfo?.queueProcessType });

    if (isIdeation) {
      debugLog('[Agent Queue] Killing ideation process:', projectId);
      this.processManager.killProcess(projectId);
      this.emitter.emit('ideation-stopped', projectId);
      return true;
    }
    debugLog('[Agent Queue] No running ideation process found for:', projectId);
    return false;
  }

  /**
   * Check if ideation is running for a project
   */
  isIdeationRunning(projectId: string): boolean {
    const processInfo = this.state.getProcess(projectId);
    return processInfo?.queueProcessType === 'ideation';
  }

  /**
   * Stop roadmap generation for a project
   */
  stopRoadmap(projectId: string): boolean {
    debugLog('[Agent Queue] Stop roadmap requested:', { projectId });

    const processInfo = this.state.getProcess(projectId);
    const isRoadmap = processInfo?.queueProcessType === 'roadmap';
    debugLog('[Agent Queue] Roadmap process running?', { projectId, isRoadmap, processType: processInfo?.queueProcessType });

    if (isRoadmap) {
      debugLog('[Agent Queue] Killing roadmap process:', projectId);
      this.processManager.killProcess(projectId);
      this.emitter.emit('roadmap-stopped', projectId);
      return true;
    }
    debugLog('[Agent Queue] No running roadmap process found for:', projectId);
    return false;
  }

  /**
   * Check if roadmap is running for a project
   */
  isRoadmapRunning(projectId: string): boolean {
    const processInfo = this.state.getProcess(projectId);
    return processInfo?.queueProcessType === 'roadmap';
  }

  /**
   * Start persona generation process
   */
  async startPersonaGeneration(
    projectId: string,
    projectPath: string,
    refresh: boolean = false,
    config?: PersonaConfig
  ): Promise<void> {
    debugLog('[Agent Queue] Starting persona generation:', {
      projectId,
      projectPath,
      refresh,
      config
    });

    const autoBuildSource = this.processManager.getAutoBuildSourcePath();

    if (!autoBuildSource) {
      debugError('[Agent Queue] Auto-build source path not found');
      this.emitter.emit('persona-error', projectId, 'Auto-build source path not found. Please configure it in App Settings.');
      return;
    }

    const personaRunnerPath = path.join(autoBuildSource, 'runners', 'persona_runner.py');

    if (!existsSync(personaRunnerPath)) {
      debugError('[Agent Queue] Persona runner not found at:', personaRunnerPath);
      this.emitter.emit('persona-error', projectId, `Persona runner not found at: ${personaRunnerPath}`);
      return;
    }

    const args = [personaRunnerPath, '--project', projectPath];

    if (refresh) {
      args.push('--refresh');
    }

    // Add research flag if enabled
    if (config?.enableResearch) {
      args.push('--research');
    }

    // Add model and thinking level from config
    if (config?.model) {
      args.push('--model', config.model);
    }
    if (config?.thinkingLevel) {
      args.push('--thinking-level', config.thinkingLevel);
    }

    debugLog('[Agent Queue] Spawning persona process with args:', args);

    await this.spawnPersonaProcess(projectId, projectPath, args);
  }

  /**
   * Spawn a Python process for persona generation
   */
  private async spawnPersonaProcess(
    projectId: string,
    projectPath: string,
    args: string[]
  ): Promise<void> {
    debugLog('[Agent Queue] Spawning persona process:', { projectId, projectPath });

    const autoBuildSource = this.processManager.getAutoBuildSourcePath();
    const cwd = autoBuildSource || process.cwd();

    // Ensure Python environment is ready before spawning
    if (!await this.ensurePythonEnvReady(projectId, 'persona-error')) {
      return;
    }

    // Kill existing process for this project if any
    const wasKilled = this.processManager.killProcess(projectId);
    if (wasKilled) {
      debugLog('[Agent Queue] Killed existing persona process for project:', projectId);
    }

    // Generate unique spawn ID for this process instance
    const spawnId = this.state.generateSpawnId();
    debugLog('[Agent Queue] Generated persona spawn ID:', spawnId);

    // Get combined environment variables
    const combinedEnv = this.processManager.getCombinedEnv(projectPath);

    // Get active Claude profile environment
    const profileEnv = getProfileEnv();

    // Get active API profile environment variables
    const apiProfileEnv = await getAPIProfileEnv();

    // Get OAuth mode clearing vars
    const oauthModeClearVars = getOAuthModeClearVars(apiProfileEnv);

    // Get Python path from process manager
    const pythonPath = this.processManager.getPythonPath();

    // Get Python environment from pythonEnvManager
    const pythonEnv = pythonEnvManager.getPythonEnv();

    // Build PYTHONPATH
    const pythonPathParts: string[] = [];
    if (pythonEnv.PYTHONPATH) {
      pythonPathParts.push(pythonEnv.PYTHONPATH);
    }
    if (autoBuildSource) {
      pythonPathParts.push(autoBuildSource);
    }
    const combinedPythonPath = pythonPathParts.join(process.platform === 'win32' ? ';' : ':');

    // Build final environment
    const finalEnv = {
      ...process.env,
      ...pythonEnv,
      ...combinedEnv,
      ...oauthModeClearVars,
      ...profileEnv,
      ...apiProfileEnv,
      PYTHONPATH: combinedPythonPath,
      PYTHONUNBUFFERED: '1',
      PYTHONUTF8: '1'
    };

    // Parse Python command
    const [pythonCommand, pythonBaseArgs] = parsePythonCommand(pythonPath);
    const childProcess = spawn(pythonCommand, [...pythonBaseArgs, ...args], {
      cwd,
      env: finalEnv
    });

    this.state.addProcess(projectId, {
      taskId: projectId,
      process: childProcess,
      startedAt: new Date(),
      projectPath,
      spawnId,
      queueProcessType: 'persona'
    });

    // Track progress through output
    let progressPhase = 'analyzing';
    let progressPercent = 10;
    let allPersonaOutput = '';

    // Handle stdout
    childProcess.stdout?.on('data', (data: Buffer) => {
      const log = data.toString('utf8');
      allPersonaOutput = (allPersonaOutput + log).slice(-10000);

      // Parse progress phases
      if (log.includes('PHASE 1') || log.includes('PROJECT ANALYSIS')) {
        progressPhase = 'analyzing';
        progressPercent = 20;
      } else if (log.includes('PHASE 2') || log.includes('USER TYPE DISCOVERY')) {
        progressPhase = 'discovering';
        progressPercent = 40;
      } else if (log.includes('PHASE 3') || log.includes('WEB RESEARCH')) {
        progressPhase = 'researching';
        progressPercent = 60;
      } else if (log.includes('PHASE 4') || log.includes('PERSONA GENERATION')) {
        progressPhase = 'generating';
        progressPercent = 80;
      } else if (log.includes('PERSONAS GENERATED') || log.includes('complete')) {
        progressPhase = 'complete';
        progressPercent = 100;
      }

      this.emitter.emit('persona-progress', projectId, {
        phase: progressPhase,
        progress: progressPercent,
        message: log.trim().substring(0, 200)
      });
    });

    // Handle stderr
    childProcess.stderr?.on('data', (data: Buffer) => {
      const log = data.toString('utf8');
      allPersonaOutput = (allPersonaOutput + log).slice(-10000);
      console.error('[Persona STDERR]', log);
      this.emitter.emit('persona-progress', projectId, {
        phase: progressPhase,
        progress: progressPercent,
        message: log.trim().substring(0, 200)
      });
    });

    // Handle process exit
    childProcess.on('exit', (code: number | null) => {
      debugLog('[Agent Queue] Persona process exited:', { projectId, code, spawnId });

      const wasIntentionallyStopped = this.state.wasSpawnKilled(spawnId);
      if (wasIntentionallyStopped) {
        debugLog('[Agent Queue] Persona process was intentionally stopped, ignoring exit');
        this.state.clearKilledSpawn(spawnId);
        this.emitter.emit('persona-stopped', projectId);
        return;
      }

      const processInfo = this.state.getProcess(projectId);
      const storedProjectPath = processInfo?.projectPath;
      this.state.deleteProcess(projectId);

      // Check for rate limit if process failed
      if (code !== 0) {
        const rateLimitDetection = detectRateLimit(allPersonaOutput);
        if (rateLimitDetection.isRateLimited) {
          debugLog('[Agent Queue] Rate limit detected for persona');
          const rateLimitInfo = createSDKRateLimitInfo('persona', rateLimitDetection, {
            projectId
          });
          this.emitter.emit('sdk-rate-limit', rateLimitInfo);
        }
      }

      if (code === 0) {
        debugLog('[Agent Queue] Persona generation completed successfully');
        this.emitter.emit('persona-progress', projectId, {
          phase: 'complete',
          progress: 100,
          message: 'Persona generation complete'
        });

        // Load and emit the complete personas config
        if (storedProjectPath) {
          try {
            const personasFilePath = path.join(
              storedProjectPath,
              '.auto-claude',
              'personas',
              'personas.json'
            );
            debugLog('[Agent Queue] Loading personas from:', personasFilePath);
            if (existsSync(personasFilePath)) {
              const loadPersonas = async (): Promise<void> => {
                try {
                  const content = await fsPromises.readFile(personasFilePath, 'utf-8');
                  const rawPersonas = JSON.parse(content);
                  // Personas are already in camelCase from the backend
                  const personasConfig: PersonasConfig = {
                    version: rawPersonas.version || '1.0',
                    projectId: rawPersonas.projectId || projectId,
                    personas: rawPersonas.personas || [],
                    metadata: {
                      generatedAt: rawPersonas.metadata?.generatedAt || new Date().toISOString(),
                      discoverySynced: rawPersonas.metadata?.discoverySynced ?? true,
                      researchEnriched: rawPersonas.metadata?.researchEnriched ?? false,
                      roadmapSynced: rawPersonas.metadata?.roadmapSynced ?? false,
                      personaCount: (rawPersonas.personas || []).length
                    }
                  };
                  debugLog('[Agent Queue] Loaded personas:', {
                    personaCount: personasConfig.personas.length
                  });
                  this.emitter.emit('persona-complete', projectId, personasConfig);
                } catch (err) {
                  debugError('[Persona] Failed to load personas:', err);
                  this.emitter.emit('persona-error', projectId,
                    `Failed to load personas: ${err instanceof Error ? err.message : 'Unknown error'}`);
                }
              };
              loadPersonas().catch((err: unknown) => {
                debugError('[Agent Queue] Unhandled error loading personas:', err);
              });
            } else {
              debugError('[Persona] personas.json not found at:', personasFilePath);
              this.emitter.emit('persona-error', projectId,
                'Personas completed but file not found.');
            }
          } catch (err) {
            debugError('[Persona] Unexpected error in persona completion:', err);
            this.emitter.emit('persona-error', projectId,
              `Unexpected error: ${err instanceof Error ? err.message : 'Unknown error'}`);
          }
        } else {
          debugError('[Persona] No project path available for persona completion');
          this.emitter.emit('persona-error', projectId, 'Personas completed but project path not found.');
        }
      } else {
        debugError('[Agent Queue] Persona generation failed:', { projectId, code });
        this.emitter.emit('persona-error', projectId, `Persona generation failed with exit code ${code}`);
      }
    });

    // Handle process error
    childProcess.on('error', (err: Error) => {
      console.error('[Persona] Process error:', err.message);
      this.state.deleteProcess(projectId);
      this.emitter.emit('persona-error', projectId, err.message);
    });
  }

  /**
   * Stop persona generation for a project
   */
  stopPersonas(projectId: string): boolean {
    debugLog('[Agent Queue] Stop persona requested:', { projectId });

    const processInfo = this.state.getProcess(projectId);
    const isPersona = processInfo?.queueProcessType === 'persona';
    debugLog('[Agent Queue] Persona process running?', { projectId, isPersona, processType: processInfo?.queueProcessType });

    if (isPersona) {
      debugLog('[Agent Queue] Killing persona process:', projectId);
      this.processManager.killProcess(projectId);
      this.emitter.emit('persona-stopped', projectId);
      return true;
    }
    debugLog('[Agent Queue] No running persona process found for:', projectId);
    return false;
  }

  /**
   * Check if persona generation is running for a project
   */
  isPersonaRunning(projectId: string): boolean {
    const processInfo = this.state.getProcess(projectId);
    return processInfo?.queueProcessType === 'persona';
  }

  /**
   * Start persona enrichment for a new persona (AI-assisted creation)
   */
  async startPersonaEnrichment(
    projectId: string,
    projectPath: string,
    input: PersonaEnrichmentInput,
    config?: PersonaConfig
  ): Promise<void> {
    debugLog('[Agent Queue] Starting persona enrichment (new):', {
      projectId,
      projectPath,
      role: input.role,
      type: input.type
    });

    const autoBuildSource = this.processManager.getAutoBuildSourcePath();

    if (!autoBuildSource) {
      debugError('[Agent Queue] Auto-build source path not found');
      this.emitter.emit('persona-enrichment-error', projectId, 'Auto-build source path not found. Please configure it in App Settings.');
      return;
    }

    const personaRunnerPath = path.join(autoBuildSource, 'runners', 'persona_runner.py');

    if (!existsSync(personaRunnerPath)) {
      debugError('[Agent Queue] Persona runner not found at:', personaRunnerPath);
      this.emitter.emit('persona-enrichment-error', projectId, `Persona runner not found at: ${personaRunnerPath}`);
      return;
    }

    const args = [
      personaRunnerPath,
      '--project', projectPath,
      '--enrich-new',
      '--role', input.role,
      '--description', input.description,
      '--persona-type', input.type
    ];

    // Add optional fields
    if (input.primaryGoal) {
      args.push('--primary-goal', input.primaryGoal);
    }
    if (input.experienceLevel) {
      args.push('--experience-level', input.experienceLevel);
    }
    if (input.industry) {
      args.push('--industry', input.industry);
    }

    // Add model and thinking level from config
    if (config?.model) {
      args.push('--model', config.model);
    }
    if (config?.thinkingLevel) {
      args.push('--thinking-level', config.thinkingLevel);
    }

    debugLog('[Agent Queue] Spawning persona enrichment process with args:', args);

    await this.spawnPersonaEnrichmentProcess(projectId, projectPath, args, 'new');
  }

  /**
   * Start persona enrichment for an existing persona
   */
  async startPersonaEnrichmentExisting(
    projectId: string,
    projectPath: string,
    personaId: string,
    persona: Persona,
    config?: PersonaConfig
  ): Promise<void> {
    debugLog('[Agent Queue] Starting persona enrichment (existing):', {
      projectId,
      projectPath,
      personaId,
      personaName: persona.name
    });

    const autoBuildSource = this.processManager.getAutoBuildSourcePath();

    if (!autoBuildSource) {
      debugError('[Agent Queue] Auto-build source path not found');
      this.emitter.emit('persona-enrichment-error', projectId, 'Auto-build source path not found. Please configure it in App Settings.');
      return;
    }

    const personaRunnerPath = path.join(autoBuildSource, 'runners', 'persona_runner.py');

    if (!existsSync(personaRunnerPath)) {
      debugError('[Agent Queue] Persona runner not found at:', personaRunnerPath);
      this.emitter.emit('persona-enrichment-error', projectId, `Persona runner not found at: ${personaRunnerPath}`);
      return;
    }

    const args = [
      personaRunnerPath,
      '--project', projectPath,
      '--enrich-existing',
      '--persona-id', personaId
    ];

    // Add model and thinking level from config
    if (config?.model) {
      args.push('--model', config.model);
    }
    if (config?.thinkingLevel) {
      args.push('--thinking-level', config.thinkingLevel);
    }

    debugLog('[Agent Queue] Spawning persona enrichment process with args:', args);

    await this.spawnPersonaEnrichmentProcess(projectId, projectPath, args, 'existing');
  }

  /**
   * Spawn a Python process for persona enrichment
   */
  private async spawnPersonaEnrichmentProcess(
    projectId: string,
    projectPath: string,
    args: string[],
    enrichmentType: 'new' | 'existing'
  ): Promise<void> {
    debugLog('[Agent Queue] Spawning persona enrichment process:', { projectId, projectPath, enrichmentType });

    const autoBuildSource = this.processManager.getAutoBuildSourcePath();
    const cwd = autoBuildSource || process.cwd();

    // Ensure Python environment is ready before spawning
    if (!await this.ensurePythonEnvReady(projectId, 'persona-error')) {
      this.emitter.emit('persona-enrichment-error', projectId, 'Python environment not ready');
      return;
    }

    // Use a unique task ID for enrichment to not conflict with regular persona generation
    const enrichmentTaskId = `${projectId}-enrichment`;

    // Kill existing enrichment process for this project if any
    const wasKilled = this.processManager.killProcess(enrichmentTaskId);
    if (wasKilled) {
      debugLog('[Agent Queue] Killed existing enrichment process for project:', projectId);
    }

    // Generate unique spawn ID for this process instance
    const spawnId = this.state.generateSpawnId();
    debugLog('[Agent Queue] Generated enrichment spawn ID:', spawnId);

    // Get combined environment variables
    const combinedEnv = this.processManager.getCombinedEnv(projectPath);

    // Get active Claude profile environment
    const profileEnv = getProfileEnv();

    // Get active API profile environment variables
    const apiProfileEnv = await getAPIProfileEnv();

    // Get OAuth mode clearing vars
    const oauthModeClearVars = getOAuthModeClearVars(apiProfileEnv);

    // Get Python path from process manager
    const pythonPath = this.processManager.getPythonPath();

    // Get Python environment from pythonEnvManager
    const pythonEnv = pythonEnvManager.getPythonEnv();

    // Build PYTHONPATH
    const pythonPathParts: string[] = [];
    if (pythonEnv.PYTHONPATH) {
      pythonPathParts.push(pythonEnv.PYTHONPATH);
    }
    if (autoBuildSource) {
      pythonPathParts.push(autoBuildSource);
    }
    const combinedPythonPath = pythonPathParts.join(process.platform === 'win32' ? ';' : ':');

    // Build final environment
    const finalEnv = {
      ...process.env,
      ...pythonEnv,
      ...combinedEnv,
      ...oauthModeClearVars,
      ...profileEnv,
      ...apiProfileEnv,
      PYTHONPATH: combinedPythonPath,
      PYTHONUNBUFFERED: '1',
      PYTHONUTF8: '1'
    };

    // Parse Python command
    const [pythonCommand, pythonBaseArgs] = parsePythonCommand(pythonPath);
    const childProcess = spawn(pythonCommand, [...pythonBaseArgs, ...args], {
      cwd,
      env: finalEnv
    });

    this.state.addProcess(enrichmentTaskId, {
      taskId: enrichmentTaskId,
      process: childProcess,
      startedAt: new Date(),
      projectPath,
      spawnId,
      queueProcessType: 'persona-enrichment'
    });

    // Track progress through output
    let progressPhase = 'researching';
    let progressPercent = 10;
    let allEnrichmentOutput = '';

    // Handle stdout
    childProcess.stdout?.on('data', (data: Buffer) => {
      const log = data.toString('utf8');
      allEnrichmentOutput = (allEnrichmentOutput + log).slice(-10000);

      // Parse enrichment-specific markers
      const phaseMatch = log.match(/ENRICHMENT_PHASE:(\w+)/);
      if (phaseMatch) {
        progressPhase = phaseMatch[1];
        progressPercent = progressPhase === 'researching' ? 30 : progressPhase === 'generating' ? 60 : progressPercent;
      }

      // Check for completion with persona data
      const completeMatch = log.match(/ENRICHMENT_COMPLETE:(.+)/);
      if (completeMatch) {
        try {
          const persona = JSON.parse(completeMatch[1]);
          debugLog('[Agent Queue] Enrichment complete, persona:', { id: persona.id, name: persona.name });
          this.emitter.emit('persona-enrichment-complete', projectId, persona);
        } catch (parseErr) {
          debugError('[Agent Queue] Failed to parse enriched persona:', parseErr);
        }
      }

      // Check for error
      const errorMatch = log.match(/ENRICHMENT_ERROR:(.+)/);
      if (errorMatch) {
        debugError('[Agent Queue] Enrichment error:', errorMatch[1]);
        this.emitter.emit('persona-enrichment-error', projectId, errorMatch[1]);
      }

      this.emitter.emit('persona-enrichment-progress', projectId, {
        phase: progressPhase,
        progress: progressPercent,
        message: log.trim().substring(0, 200)
      });
    });

    // Handle stderr
    childProcess.stderr?.on('data', (data: Buffer) => {
      const log = data.toString('utf8');
      allEnrichmentOutput = (allEnrichmentOutput + log).slice(-10000);
      console.error('[Persona Enrichment STDERR]', log);
      this.emitter.emit('persona-enrichment-progress', projectId, {
        phase: progressPhase,
        progress: progressPercent,
        message: log.trim().substring(0, 200)
      });
    });

    // Handle process exit
    childProcess.on('exit', (code: number | null) => {
      debugLog('[Agent Queue] Persona enrichment process exited:', { projectId, code, spawnId, enrichmentType });

      const wasIntentionallyStopped = this.state.wasSpawnKilled(spawnId);
      if (wasIntentionallyStopped) {
        debugLog('[Agent Queue] Persona enrichment process was intentionally stopped, ignoring exit');
        this.state.clearKilledSpawn(spawnId);
        return;
      }

      this.state.deleteProcess(enrichmentTaskId);

      // Check for rate limit if process failed
      if (code !== 0) {
        const rateLimitDetection = detectRateLimit(allEnrichmentOutput);
        if (rateLimitDetection.isRateLimited) {
          debugLog('[Agent Queue] Rate limit detected for persona enrichment');
          const rateLimitInfo = createSDKRateLimitInfo('persona', rateLimitDetection, {
            projectId
          });
          this.emitter.emit('sdk-rate-limit', rateLimitInfo);
        }

        // Only emit error if we haven't already (via ENRICHMENT_ERROR marker)
        if (!allEnrichmentOutput.includes('ENRICHMENT_COMPLETE:') && !allEnrichmentOutput.includes('ENRICHMENT_ERROR:')) {
          this.emitter.emit('persona-enrichment-error', projectId, `Persona enrichment failed with exit code ${code}`);
        }
      }
    });

    // Handle process error
    childProcess.on('error', (err: Error) => {
      console.error('[Persona Enrichment] Process error:', err.message);
      this.state.deleteProcess(enrichmentTaskId);
      this.emitter.emit('persona-enrichment-error', projectId, err.message);
    });
  }
}
