// backend/src/stubs.rs

pub type AppHandle = ();

pub mod state {
    pub type State<'a, T> = &'a T;
}

pub use state::State;
pub use state::State as TauriState;

pub fn check_admin(_app: &AppHandle) -> crate::error::MyceliumResult<()> {
    Ok(())
}

pub trait Manager {
    fn path(&self) -> StubPath;
    fn try_state<T: Send + Sync + 'static>(&self) -> Option<&T>;
    fn emit<S: serde::Serialize>(&self, event: &str, payload: S) -> Result<(), String>;
}

pub struct StubPath;
impl StubPath {
    pub fn app_config_dir(&self) -> Result<std::path::PathBuf, String> {
        Ok(std::path::PathBuf::from("config"))
    }
    pub fn app_data_dir(&self) -> Result<std::path::PathBuf, String> {
        Ok(std::path::PathBuf::from("data"))
    }
}

impl Manager for () {
    fn path(&self) -> StubPath {
        StubPath
    }
    fn try_state<T: Send + Sync + 'static>(&self) -> Option<&T> {
        None
    }
    fn emit<S: serde::Serialize>(&self, _event: &str, _payload: S) -> Result<(), String> {
        Ok(())
    }
}

pub trait Emitter {
    fn emit<S: serde::Serialize>(&self, event: &str, payload: S) -> Result<(), String>;
}

impl Emitter for () {
    fn emit<S: serde::Serialize>(&self, _event: &str, _payload: S) -> Result<(), String> {
        Ok(())
    }
}
