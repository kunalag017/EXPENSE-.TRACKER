cmake_minimum_required(VERSION 3.27)

project(ExpenseTracker
  VERSION 1.0.0
  LANGUAGES CXX
)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

include(FetchContent)
set(FETCHCONTENT_UPDATES_DISCONNECTED ON)
option(BUILD_CPP_WEB "Build Drogon C++ web server" ON)

# Prefer already-downloaded sources (offline-friendly)
set(_local_deps_dir "${CMAKE_CURRENT_SOURCE_DIR}/build/_deps")

# SFML (windowing + graphics)
if(EXISTS "${_local_deps_dir}/sfml-src/CMakeLists.txt")
  FetchContent_Declare(SFML SOURCE_DIR "${_local_deps_dir}/sfml-src")
else()
  FetchContent_Declare(
    SFML
    GIT_REPOSITORY https://github.com/SFML/SFML.git
    GIT_TAG 2.6.1
  )
endif()
set(SFML_BUILD_AUDIO OFF CACHE BOOL "" FORCE)
set(SFML_BUILD_NETWORK OFF CACHE BOOL "" FORCE)
set(SFML_BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
set(SFML_BUILD_DOC OFF CACHE BOOL "" FORCE)
FetchContent_MakeAvailable(SFML)

# Dear ImGui + ImGui-SFML
if(EXISTS "${_local_deps_dir}/imgui-src/CMakeLists.txt")
  FetchContent_Declare(imgui SOURCE_DIR "${_local_deps_dir}/imgui-src")
else()
  FetchContent_Declare(
    imgui
    GIT_REPOSITORY https://github.com/ocornut/imgui.git
    GIT_TAG v1.91.5
  )
endif()

if(EXISTS "${_local_deps_dir}/imgui_sfml-src/CMakeLists.txt")
  FetchContent_Declare(imgui_sfml SOURCE_DIR "${_local_deps_dir}/imgui_sfml-src")
elseif(EXISTS "${_local_deps_dir}/imguisfml-src/CMakeLists.txt")
  FetchContent_Declare(imgui_sfml SOURCE_DIR "${_local_deps_dir}/imguisfml-src")
else()
  FetchContent_Declare(
    imgui_sfml
    GIT_REPOSITORY https://github.com/SFML/imgui-sfml.git
    GIT_TAG v2.6
  )
endif()
FetchContent_MakeAvailable(imgui imgui_sfml)

if(BUILD_CPP_WEB)
  if(EXISTS "${_local_deps_dir}/drogon-src/CMakeLists.txt")
    FetchContent_Declare(drogon SOURCE_DIR "${_local_deps_dir}/drogon-src")
  else()
    FetchContent_Declare(
      drogon
      GIT_REPOSITORY https://github.com/drogonframework/drogon.git
      GIT_TAG v1.9.9
    )
  endif()
  set(BUILD_CTL OFF CACHE BOOL "" FORCE)
  set(BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
  set(BUILD_ORM OFF CACHE BOOL "" FORCE)
  FetchContent_MakeAvailable(drogon)
endif()

add_executable(expense_tracker
  src/main.cpp
  src/core/User.cpp
  src/core/Transaction.cpp
  src/core/ExpenseTracker.cpp
  src/core/Analytics.cpp
  src/core/AIAdvisor.cpp
  src/core/FileStorage.cpp
  src/ui/App.cpp
)

target_include_directories(expense_tracker PRIVATE
  ${CMAKE_CURRENT_SOURCE_DIR}/src
)

target_link_libraries(expense_tracker PRIVATE
  sfml-graphics
  sfml-window
  sfml-system
  ImGui-SFML::ImGui-SFML
)

if(MSVC)
  target_compile_options(expense_tracker PRIVATE /W4 /permissive-)
else()
  target_compile_options(expense_tracker PRIVATE -Wall -Wextra -Wpedantic)
endif()

if(BUILD_CPP_WEB)
  add_executable(expense_tracker_web
    server/main.cc
    server/WebController.cc
    server/AppService.cc
    src/core/User.cpp
    src/core/Transaction.cpp
    src/core/ExpenseTracker.cpp
    src/core/Analytics.cpp
    src/core/AIAdvisor.cpp
    src/core/FileStorage.cpp
  )

  target_include_directories(expense_tracker_web PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/server
    ${CMAKE_CURRENT_SOURCE_DIR}/src
  )

  target_link_libraries(expense_tracker_web PRIVATE
    Drogon::Drogon
  )

  if(MSVC)
    target_compile_options(expense_tracker_web PRIVATE /W4 /permissive-)
  else()
    target_compile_options(expense_tracker_web PRIVATE -Wall -Wextra -Wpedantic)
  endif()
endif()

